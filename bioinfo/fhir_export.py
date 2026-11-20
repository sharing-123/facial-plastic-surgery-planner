"""FHIR R4B export of the measurements and planned procedure, for interoperability with hospital systems.

Content: pseudonymous Patient, Observation resources with UCUM units for the measured lengths, angles, areas and suture counts,
and a Condition with suggested ICD-10/HPO codes. Everything is marked verificationStatus = unconfirmed and tagged
'research-prototype': these are TOOL-DERIVED values for a clinician to confirm, not clinical documentation by themselves.
No image, name or identifier is included; only the pseudonym you pass in."""
import datetime
import uuid

from . import clinical_coding as cc

UCUM = "http://unitsofmeasure.org"
TAG = {"system": "https://example.org/fhir/tags", "code": "research-prototype", "display": "Tool-derived, unvalidated, clinician must confirm"}


def _obs(pid, text, value, unit, code, when, method=None):
    o = {"resourceType": "Observation", "id": str(uuid.uuid4()), "meta": {"tag": [TAG]}, "status": "preliminary",
         "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/observation-category", "code": "exam"}]}],
         "code": {"text": text}, "subject": {"reference": f"Patient/{pid}"}, "effectiveDateTime": when,
         "valueQuantity": {"value": float(value), "unit": unit, "system": UCUM, "code": code}}
    if method:
        o["method"] = {"text": method}
    return o


def build_bundle(pseudonym, report, plan, ctx, scale_note, when=None):
    when = when or datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    region_key = (report.get("regions_crossed") or ["cheek"])[0]
    pid = pseudonym
    meth = f"2D photo measurement; {scale_note}"
    entries = [{"resource": {"resourceType": "Patient", "id": pid, "meta": {"tag": [TAG]}}}]
    obs = [_obs(pid, "Wound or scar length along centre line", report["length_mm"], "mm", "mm", when, meth),
           _obs(pid, "Angle between wound axis and relaxed skin tension lines (tool estimate)", report["mean_angle_to_rstl_deg"], "degree", "deg", when, "RSTL direction set by clinician or rule-based approximation")]
    if report.get("area_mm2") is not None:
        obs.append(_obs(pid, "Wound or scar area", report["area_mm2"], "mm2", "mm2", when, meth))
    if plan.get("rencana_jahitan"):
        obs.append(_obs(pid, "Planned number of skin sutures (tool estimate)", plan["rencana_jahitan"]["perkiraan_jumlah_jahitan_kulit"], "{count}", "{count}", when, "layout from wound length and chosen spacing"))
    entries += [{"resource": o} for o in obs]
    coding = cc.code_wound_or_scar(ctx.get("kind", "laserasi_baru"), region_key, ctx.get("scar_type"))
    cond = {"resourceType": "Condition", "id": str(uuid.uuid4()), "meta": {"tag": [TAG]},
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
            "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "unconfirmed"}]},
            "code": {"coding": coding, "text": plan.get("wilayah", "")}, "subject": {"reference": f"Patient/{pid}"},
            "bodySite": [{"text": plan.get("wilayah", "")}], "recordedDate": when[:10],
            "note": [{"text": "Suggested codes from a research prototype; confirm before use. Primary technique suggested by the tool: "
                              + (plan["teknik"][0]["nama"] if plan.get("teknik") else "none")}]}
    entries.append({"resource": cond})
    return {"resourceType": "Bundle", "type": "collection", "timestamp": when, "meta": {"tag": [TAG]}, "entry": entries}


def validate(bundle):
    """Validate against the FHIR R4B models (pydantic). Raises on structural errors; returns the parsed Bundle."""
    from fhir.resources.R4B.bundle import Bundle
    return Bundle.model_validate(bundle)
