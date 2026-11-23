"""FaceStudio API: saved cases per browser workspace, optional MobileSAM segmentation, health, and the built web app.

Landmarks, measurements and plans are computed in the browser; this server only stores what the user saves (numbers and a
small thumbnail) and serves the site. The original photograph is never sent here."""
import base64
import importlib.util
import os
import re
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, sam

VERSION = "1.0.0"
WS_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
CODE_RE = re.compile(r"^[A-Za-z0-9_-]{3,24}$")
EX_RE = re.compile(r"^[a-z0-9_]{1,40}\.jpg$")
MAX_BODY = 2_500_000
MAX_SUMMARY = 20_000
MAX_THUMB = 80_000
DEPS = ("fastapi", "numpy", "PIL", "onnxruntime", "cv2", "psycopg")


class CaseIn(BaseModel):
    code: str = Field(pattern=CODE_RE.pattern)
    summary: dict
    thumb: str | None = None


class SegmentIn(BaseModel):
    image_b64: str = Field(min_length=100, max_length=MAX_BODY)
    point: tuple[float, float]


def workspace(x_workspace: str | None = Header(default=None)) -> str:
    if not x_workspace or not WS_RE.match(x_workspace):
        raise HTTPException(400, "A valid X-Workspace header is required.")
    return x_workspace


def create_app() -> FastAPI:
    app = FastAPI(title="FaceStudio", version=VERSION, docs_url="/api/docs", openapi_url="/api/openapi.json")

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.url.path.startswith("/api") and int(request.headers.get("content-length") or 0) > MAX_BODY:
            return JSONResponse({"detail": "Request body is too large."}, status_code=413)
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "camera=(self), microphone=(), geolocation=()")
        if request.url.path.startswith("/api"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    @app.get("/api/health")
    def health():
        problems = [m for m in DEPS if importlib.util.find_spec(m) is None]
        try:
            db.list_cases("healthcheck0", limit=1)
            ok_db = True
        except Exception as e:  # noqa: BLE001 - report any storage failure to the probe
            ok_db = False
            problems.append(f"db: {type(e).__name__}")
        return JSONResponse({"status": "ok" if ok_db and not problems else "degraded", "version": VERSION, "db": db.label(),
                             "models": {"mobilesam": sam.available()}, "missing": problems}, status_code=200 if ok_db else 503)

    @app.get("/api/cases")
    def list_cases(code: str | None = None, ws: str = Depends(workspace)):
        if code is not None and not CODE_RE.match(code):
            raise HTTPException(422, "Invalid case code.")
        return db.list_cases(ws, code)

    @app.post("/api/cases", status_code=201)
    def add_case(body: CaseIn, ws: str = Depends(workspace)):
        import json as _json

        if len(_json.dumps(body.summary)) > MAX_SUMMARY:
            raise HTTPException(413, "The case summary is too large.")
        thumb = body.thumb
        if thumb is not None:
            if not thumb.startswith("data:image/jpeg;base64,") or len(thumb) > MAX_THUMB:
                raise HTTPException(422, "The thumbnail must be a small JPEG data URL.")
            try:
                base64.b64decode(thumb.split(",", 1)[1], validate=True)
            except Exception as e:  # noqa: BLE001
                raise HTTPException(422, "The thumbnail is not valid base64.") from e
        return db.add_case(ws, body.code, body.summary, thumb)

    @app.get("/api/cases/{cid}")
    def get_case(cid: str, ws: str = Depends(workspace)):
        r = db.get_case(ws, cid)
        if r is None:
            raise HTTPException(404, "Case not found.")
        return r

    @app.delete("/api/cases/{cid}", status_code=204)
    def delete_case(cid: str, ws: str = Depends(workspace)):
        if not db.delete_case(ws, cid):
            raise HTTPException(404, "Case not found.")

    @app.post("/api/segment")
    def segment(body: SegmentIn, ws: str = Depends(workspace)):
        if not sam.available():
            raise HTTPException(503, "Segmentation weights are not installed on this server (mobile_sam_image_encoder.onnx and sam_mask_decoder_single.onnx). The browser outlines the lesion itself.")
        try:
            return sam.segment(body.image_b64, body.point)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"The image could not be segmented: {type(e).__name__}") from e

    ex_dir = Path(os.environ.get("FACESTUDIO_EXAMPLES", Path(__file__).resolve().parents[1] / "examples"))

    @app.get("/api/examples")
    def examples():
        f = ex_dir / "examples.json"
        if not f.is_file():
            return []
        import json as _json

        return _json.loads(f.read_text(encoding="utf8"))

    @app.get("/api/examples/img/{name}")
    def example_img(name: str):
        f = ex_dir / name
        if not EX_RE.match(name) or not f.is_file():
            raise HTTPException(404, "Example image not found.")
        return FileResponse(f, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})

    dist = Path(os.environ.get("FACESTUDIO_DIST", Path(__file__).resolve().parents[2] / "web" / "dist"))
    if dist.is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets") if (dist / "assets").is_dir() else None

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = (dist / path).resolve()
            if path and f.is_file() and dist.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
