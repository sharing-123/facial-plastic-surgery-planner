"""Fetch a few public-licence face photos from Wikimedia Commons as TEST FIXTURES (never patient data).

Only CC0 / public domain / CC BY(-SA) files are kept, and the attribution is written next to each image
(ATTRIBUTION.json). Run:  python scripts/fetch_fixtures.py <out_dir> [query ...]
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "FaceStudioFixtures/1.0 (test fixture download; contact via repository)"
OK = re.compile(r"(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+|CC-BY)", re.I)


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read()


def search(q, limit=25):
    u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6"
         f"&gsrlimit={limit}&gsrsearch={urllib.parse.quote(q)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1400")
    return json.loads(get(u)).get("query", {}).get("pages", {})


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    queries = sys.argv[2:] or ["portrait frontal face incategory:CC-Zero", "headshot face neutral expression filetype:bitmap incategory:Portrait_photographs"]
    meta = json.loads((out / "ATTRIBUTION.json").read_text()) if (out / "ATTRIBUTION.json").exists() else {}
    n = 0
    for q in queries:
        for p in search(q).values():
            ii = p["imageinfo"][0]
            em = ii.get("extmetadata", {})
            lic = em.get("LicenseShortName", {}).get("value", "")
            if not OK.search(lic) or ii["width"] < 700 or ii["height"] < 700:
                continue
            title = p["title"].replace("File:", "")
            safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", title)[:60]
            if not safe.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            if safe in meta:
                continue
            try:
                time.sleep(2.5)
                (out / safe).write_bytes(get(ii.get("thumburl") or ii["url"]))
            except Exception as e:  # noqa: BLE001
                print("skip", safe, e)
                continue
            meta[safe] = {"title": title, "licence": lic, "artist": re.sub("<[^>]+>", "", em.get("Artist", {}).get("value", ""))[:160],
                          "source": ii.get("descriptionurl"), "size": [ii["width"], ii["height"]]}
            n += 1
            print("ok", safe, lic)
            if n >= 14:
                break
    (out / "ATTRIBUTION.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    print("total", len(meta))


main()
