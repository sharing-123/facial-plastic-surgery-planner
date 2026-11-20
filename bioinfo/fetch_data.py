"""Downloads the public reference data used by the bioinformatics module and stores it with provenance.

 - Open Targets Platform (GraphQL): top gene-disease associations for the conditions the app deals with.
 - Enrichr gene set library Reactome_2022 (Reactome pathways as gene sets), for over-representation analysis.

Run:  python bioinfo/fetch_data.py       (needs internet; writes bioinfo/data/*)
The snapshot is dated; re-run to refresh. Association scores are literature/data-integration evidence for RESEARCH context,
not a patient-level risk and not a diagnosis."""
import datetime
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).parent / "data"
UA = {"User-Agent": "bioinfo-fetch/1.0 (research prototype)", "Content-Type": "application/json"}
OT = "https://api.platform.opentargets.org/api/v4/graphql"
# label -> (search text, words that MUST appear in the resolved disease name; a mismatch is dropped, never stored)
CONDITIONS = {"keloid": ("keloid", ["keloid"]), "cleft lip": ("cleft lip", ["cleft", "lip"]), "Bell palsy": ("Bell palsy", ["bell"]), "acne vulgaris": ("acne vulgaris", ["acne"])}


def ot(query, variables=None):
    req = urllib.request.Request(OT, data=json.dumps({"query": query, "variables": variables or {}}).encode(), headers=UA)
    return json.load(urllib.request.urlopen(req, timeout=60))["data"]


def main():
    DATA.mkdir(exist_ok=True)
    snap = {"retrieved": datetime.date.today().isoformat(), "source": OT, "diseases": {}}
    for label, (q, must) in CONDITIONS.items():
        hits = ot("query($q:String!){search(queryString:$q,entityNames:[\"disease\"],page:{index:0,size:3}){hits{id name entity}}}", {"q": q})["search"]["hits"]
        if not hits:
            snap["diseases"][label] = {"error": "no disease found"}
            continue
        d = next((h for h in hits if all(w in h["name"].lower() for w in must)), None)
        if d is None:
            snap["diseases"][label] = {"error": "search did not resolve to a matching disease; dropped", "candidates": [h["name"] for h in hits]}
            print(label, "-> NOT RESOLVED:", [h["name"] for h in hits], flush=True)
            continue
        rows = ot("query($id:String!){disease(efoId:$id){id name associatedTargets(page:{index:0,size:15}){count rows{score target{id approvedSymbol approvedName}}}}}", {"id": d["id"]})["disease"]
        snap["diseases"][label] = {"id": rows["id"], "name": rows["name"], "n_associated_targets": rows["associatedTargets"]["count"],
                                   "top_targets": [{"symbol": r["target"]["approvedSymbol"], "ensembl": r["target"]["id"], "name": r["target"]["approvedName"], "score": round(r["score"], 3)}
                                                   for r in rows["associatedTargets"]["rows"]]}
        print(label, "->", rows["id"], rows["name"], "|", [r["target"]["approvedSymbol"] for r in rows["associatedTargets"]["rows"][:6]], flush=True)
    (DATA / "opentargets_snapshot.json").write_text(json.dumps(snap, indent=1), encoding="utf-8")
    lib = "Reactome_2022"
    url = "https://maayanlab.cloud/Enrichr/geneSetLibrary?mode=text&libraryName=" + urllib.parse.quote(lib)
    txt = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]}), timeout=120).read().decode("utf-8")
    (DATA / f"{lib}.gmt.tsv").write_text(txt, encoding="utf-8")
    meta = {"library": lib, "source": url, "retrieved": datetime.date.today().isoformat(), "n_sets": txt.count("\n")}
    (DATA / "library_meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print("library:", meta)


if __name__ == "__main__":
    sys.exit(main())
