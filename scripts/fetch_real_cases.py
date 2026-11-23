"""Download openly licensed photographs of real facial palsy and cleft lip from Wikimedia Commons, with attribution.

Only CC0, public domain, CC BY and CC BY-SA files are kept. Run:  python scripts/fetch_real_cases.py <out_dir> "File:Name one.jpg" "File:Name two.jpg" ...
Writes <out_dir>/<slug>.jpg and <out_dir>/ATTRIBUTION.json (title, artist, licence, source URL). These are published patient photographs: they are used
only to show how the tools read a real face, with their licence and source stated beside them.
"""
import html
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

UA = "FaceStudio/1.0 (https://github.com/sharing-123/facial-plastic-surgery-planner; open-licence research test images) python-urllib/3"
OK = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)", re.I)


def get(url: str) -> bytes:
    for wait in (0, 8, 20, 45, 90):
        time.sleep(wait)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
    raise RuntimeError("rate limited: " + url)


def info(title: str) -> dict:
    u = ("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1400&titles=" + urllib.parse.quote(title))
    page = next(iter(json.loads(get(u))["query"]["pages"].values()))
    return page["imageinfo"][0]


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    att = {}
    if (out / "ATTRIBUTION.json").is_file():
        att = json.loads((out / "ATTRIBUTION.json").read_text(encoding="utf8"))
    for title in sys.argv[2:]:
        slug0 = re.sub(r"[^a-z0-9]+", "_", title.replace("File:", "").rsplit(".", 1)[0].lower()).strip("_")[:48]
        if (out / f"{slug0}.jpg").is_file() and f"{slug0}.jpg" in att:
            continue
        time.sleep(6)
        try:
            ii = info(title)
            ok_ = True
        except Exception as e:  # noqa: BLE001
            print('skip (info)', title, e)
            continue
        m = ii.get("extmetadata", {})
        lic = m.get("LicenseShortName", {}).get("value", "")
        if not OK.match(lic):
            print("skip (licence)", title, lic)
            continue
        slug = re.sub(r"[^a-z0-9]+", "_", title.replace("File:", "").rsplit(".", 1)[0].lower()).strip("_")[:48]
        try:
            raw = get("https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(title.replace("File:", "").replace(" ", "_")) + "?width=1200")
        except Exception as e:  # noqa: BLE001
            print("skip (download)", title, e)
            continue
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.save(out / f"{slug}.jpg", "JPEG", quality=88)
        artist = re.sub(r"<[^>]+>", "", html.unescape(m.get("Artist", {}).get("value", ""))).strip()
        att[f"{slug}.jpg"] = {"title": title, "licence": lic, "artist": artist, "source": ii["descriptionurl"], "size": list(im.size)}
        print("ok", slug, im.size, lic)
        (out / "ATTRIBUTION.json").write_text(json.dumps(att, indent=1, ensure_ascii=False), encoding="utf8")


if __name__ == "__main__":
    main()
