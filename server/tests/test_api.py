import base64
import io
import os
import tempfile
import uuid

import pytest
from fastapi.testclient import TestClient

os.environ["FACESTUDIO_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
os.environ.pop("DATABASE_URL", None)
os.environ["FACESTUDIO_MODELS"] = tempfile.mkdtemp()  # empty: no weights

from app.main import create_app  # noqa: E402


@pytest.fixture()
def client():
    return TestClient(create_app())


def ws():
    return {"X-Workspace": uuid.uuid4().hex}


def jpeg_thumb(n=200):
    from PIL import Image

    b = io.BytesIO()
    Image.new("RGB", (n, n), (120, 90, 80)).save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def test_health_reports_db_and_missing_models(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["models"]["mobilesam"] is False and j["missing"] == []


def test_workspace_required_and_validated(client):
    assert client.get("/api/cases").status_code == 400
    assert client.get("/api/cases", headers={"X-Workspace": "short"}).status_code == 400
    assert client.get("/api/cases", headers={"X-Workspace": "../../etc/passwd/0000"}).status_code == 400


def test_save_list_delete_roundtrip(client):
    h = ws()
    r = client.post("/api/cases", headers=h, json={"code": "FS-AB-1234", "summary": {"lengthMm": 24.5, "dx": "laceration"}, "thumb": jpeg_thumb()})
    assert r.status_code == 201
    cid = r.json()["id"]
    got = client.get("/api/cases", headers=h).json()
    assert len(got) == 1 and got[0]["summary"]["lengthMm"] == 24.5 and got[0]["thumb"].startswith("data:image/jpeg")
    assert client.get(f"/api/cases/{cid}", headers=h).status_code == 200
    assert client.delete(f"/api/cases/{cid}", headers=h).status_code == 204
    assert client.get("/api/cases", headers=h).json() == []
    assert client.delete(f"/api/cases/{cid}", headers=h).status_code == 404


def test_workspaces_do_not_leak(client):
    a, b = ws(), ws()
    cid = client.post("/api/cases", headers=a, json={"code": "FS-AA-0001", "summary": {"x": 1}}).json()["id"]
    assert client.get("/api/cases", headers=b).json() == []
    assert client.get(f"/api/cases/{cid}", headers=b).status_code == 404
    assert client.delete(f"/api/cases/{cid}", headers=b).status_code == 404
    assert len(client.get("/api/cases", headers=a).json()) == 1


def test_trend_filter_by_code(client):
    h = ws()
    for code in ("FS-AA-0001", "FS-AA-0001", "FS-BB-0002"):
        client.post("/api/cases", headers=h, json={"code": code, "summary": {"lengthMm": 10}})
    assert len(client.get("/api/cases?code=FS-AA-0001", headers=h).json()) == 2
    assert client.get("/api/cases?code=not valid!", headers=h).status_code == 422


@pytest.mark.parametrize("body", [
    {"code": "x", "summary": {}},                                   # code too short
    {"code": "Jane Doe", "summary": {}},                            # a name with a space is not a pseudonym code
    {"code": "FS-AA-0001"},                                         # no summary
    {"code": "FS-AA-0001", "summary": {}, "thumb": "data:text/html;base64,AAAA"},
    {"code": "FS-AA-0001", "summary": {}, "thumb": "data:image/jpeg;base64,!!!notbase64"},
])
def test_invalid_case_bodies_rejected(client, body):
    assert client.post("/api/cases", headers=ws(), json=body).status_code == 422


def test_oversized_summary_and_thumb_rejected(client):
    r = client.post("/api/cases", headers=ws(), json={"code": "FS-AA-0001", "summary": {"blob": "x" * 30000}})
    assert r.status_code == 413
    big = "data:image/jpeg;base64," + "A" * 90000
    assert client.post("/api/cases", headers=ws(), json={"code": "FS-AA-0001", "summary": {}, "thumb": big}).status_code == 422


def test_segment_answers_503_without_weights(client):
    r = client.post("/api/segment", headers=ws(), json={"image_b64": "A" * 200, "point": [10, 10]})
    assert r.status_code == 503 and "weights" in r.json()["detail"]


def test_body_size_guard(client):
    r = client.post("/api/cases", headers={**ws(), "Content-Length": "9999999"}, content=b"{}")
    assert r.status_code == 413


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"


def test_examples_list_and_images(client):
    r = client.get("/api/examples")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 3 and all(i["synthetic"] for i in items)
    for i in items:
        for lang in ("en", "id"):
            img = client.get(f"/api/examples/img/{i['sheet'][lang]}")
            assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"


def test_example_image_name_is_validated(client):
    r = client.get("/api/examples/img/..%2Fmain.py")
    assert r.headers["content-type"].startswith("text/html") or r.status_code in (404, 422)  # SPA fallback or rejected, never the file
    assert "create_app" not in r.text
    assert client.get("/api/examples/img/nope.jpg").status_code == 404
    assert client.get("/api/examples/img/EX1.JPG").status_code == 404
