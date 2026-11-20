"""Standard terminology codes for the findings the app produces: ICD-10 (WHO), Human Phenotype Ontology (HPO), and Open Targets
disease context from a dated snapshot.

The codes are SUGGESTIONS for a clinician or medical coder to confirm; the tool is not a diagnostic system. HPO IDs were looked up
from the official HPO API (ontology.jax.org) on 2026-11-20; ICD-10 codes are the WHO ICD-10 categories (always confirm against the
edition your institution uses, for example ICD-10-CM or ICD-10 WHO 2019)."""
import json
from pathlib import Path

DATA = Path(__file__).parent / "data"
ICD10_SYSTEM = "http://hl7.org/fhir/sid/icd-10"
HPO_SYSTEM = "http://purl.obolibrary.org/obo/hp.owl"

# open wound of the head by site (WHO ICD-10 S01.-); forehead and chin fall under 'other parts of head'
WOUND_BY_REGION = {
    "periorbital": ("S01.1", "Open wound of eyelid and periocular area"), "brow": ("S01.1", "Open wound of eyelid and periocular area"),
    "nose": ("S01.2", "Open wound of nose"), "cheek": ("S01.4", "Open wound of cheek and temporomandibular area"),
    "lip": ("S01.5", "Open wound of lip and oral cavity"), "perioral": ("S01.5", "Open wound of lip and oral cavity"),
    "forehead": ("S01.8", "Open wound of other parts of head"), "glabella": ("S01.8", "Open wound of other parts of head"),
    "chin": ("S01.8", "Open wound of other parts of head"), "outside_face_oval": ("S01.8", "Open wound of other parts of head"),
}
SCAR = {
    "keloid": [{"system": ICD10_SYSTEM, "code": "L91.0", "display": "Hypertrophic scar (includes keloid scar)"}, {"system": HPO_SYSTEM, "code": "HP:0010562", "display": "Keloids"}],
    "hipertrofik": [{"system": ICD10_SYSTEM, "code": "L91.0", "display": "Hypertrophic scar (includes keloid scar)"}],
    "other": [{"system": ICD10_SYSTEM, "code": "L90.5", "display": "Scar conditions and fibrosis of skin"}],
}
OTHER = {
    "acne": [{"system": ICD10_SYSTEM, "code": "L70.0", "display": "Acne vulgaris"}, {"system": HPO_SYSTEM, "code": "HP:0001061", "display": "Acne"}],
    "cleft_lip_unilateral": [{"system": ICD10_SYSTEM, "code": "Q36.9", "display": "Cleft lip, unilateral"}, {"system": HPO_SYSTEM, "code": "HP:0100333", "display": "Unilateral cleft lip"}],
    "facial_palsy_bell": [{"system": ICD10_SYSTEM, "code": "G51.0", "display": "Bell's palsy"}, {"system": HPO_SYSTEM, "code": "HP:0012799", "display": "Unilateral facial palsy"}],
    "skin_laceration": [{"system": HPO_SYSTEM, "code": "HP:6001125", "display": "Skin laceration"}],
}


def code_wound_or_scar(kind, region_key, scar_type=None):
    """Suggested codes for a wound/scar finding. kind: 'laserasi_baru' or 'parut'."""
    if kind == "laserasi_baru":
        icd = WOUND_BY_REGION.get(region_key, WOUND_BY_REGION["outside_face_oval"])
        return [{"system": ICD10_SYSTEM, "code": icd[0], "display": icd[1]}] + OTHER["skin_laceration"]
    return SCAR.get(scar_type, SCAR["other"])


def condition_context(name):
    """Open Targets snapshot entry (top associated genes with scores and provenance) or None if not in the snapshot."""
    p = DATA / "opentargets_snapshot.json"
    if not p.exists():
        return None
    snap = json.loads(p.read_text(encoding="utf-8"))
    d = snap["diseases"].get(name)
    if not d or "error" in d:
        return None
    return {**d, "retrieved": snap["retrieved"], "source": snap["source"],
            "note": "gene-disease association evidence for research context; not a patient-level risk or diagnosis"}
