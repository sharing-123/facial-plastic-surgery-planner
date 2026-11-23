"""Case storage. SQLite (one local file, no server, no account) by default; PostgreSQL when DATABASE_URL is set, so a hosted
copy keeps its data across restarts. Case codes are pseudonyms, never names. Only numbers and a small thumbnail are stored;
the original photograph is never sent to the server.

Every row belongs to a workspace: a random id the browser keeps in its own storage and sends with each request. On a shared
server this keeps one visitor's saved cases out of another visitor's list. It is separation, not authentication."""
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def database_url() -> str:
    return os.environ.get("DATABASE_URL", "").strip()


def is_pg() -> bool:
    return database_url().startswith(("postgres://", "postgresql://"))


def db_path() -> Path:
    return Path(os.environ.get("FACESTUDIO_DB", Path(__file__).resolve().parents[1] / "data" / "facestudio.db"))


SCHEMA = (
    "CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, code TEXT NOT NULL, "
    "created_at TEXT NOT NULL, summary TEXT NOT NULL, thumb TEXT);\n"
    "CREATE INDEX IF NOT EXISTS idx_cases_ws ON cases(workspace, code, created_at)"
)
_ready: set[str] = set()


def _q(sql: str) -> str:
    return sql.replace("?", "%s") if is_pg() else sql


@contextmanager
def conn():
    if is_pg():
        import psycopg
        from psycopg.rows import dict_row

        c = psycopg.connect(database_url(), row_factory=dict_row, connect_timeout=15, prepare_threshold=None)
        if "pg" not in _ready:
            for stmt in SCHEMA.split(";\n"):
                c.execute(stmt)
            c.commit()
            _ready.add("pg")
    else:
        p = db_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(p)
        c.row_factory = sqlite3.Row
        c.executescript(SCHEMA)
    try:
        yield c
        c.commit()
    finally:
        c.close()


def _x(c, sql, params=()):
    return c.execute(_q(sql), params)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _row(r) -> dict:
    return {"id": r["id"], "code": r["code"], "created_at": r["created_at"], "summary": json.loads(r["summary"]), "thumb": r["thumb"]}


def add_case(workspace: str, code: str, summary: dict, thumb: str | None) -> dict:
    cid = uuid.uuid4().hex[:12]
    with conn() as c:
        _x(c, "INSERT INTO cases(id,workspace,code,created_at,summary,thumb) VALUES(?,?,?,?,?,?)", (cid, workspace, code, now(), json.dumps(summary), thumb))
        r = _x(c, "SELECT * FROM cases WHERE id=? AND workspace=?", (cid, workspace)).fetchone()
    return _row(r)


def list_cases(workspace: str, code: str | None = None, limit: int = 200) -> list[dict]:
    with conn() as c:
        if code:
            rows = _x(c, "SELECT * FROM cases WHERE workspace=? AND code=? ORDER BY created_at DESC LIMIT ?", (workspace, code, limit)).fetchall()
        else:
            rows = _x(c, "SELECT * FROM cases WHERE workspace=? ORDER BY created_at DESC LIMIT ?", (workspace, limit)).fetchall()
    return [_row(r) for r in rows]


def get_case(workspace: str, cid: str) -> dict | None:
    with conn() as c:
        r = _x(c, "SELECT * FROM cases WHERE id=? AND workspace=?", (cid, workspace)).fetchone()
    return None if r is None else _row(r)


def delete_case(workspace: str, cid: str) -> bool:
    with conn() as c:
        return _x(c, "DELETE FROM cases WHERE id=? AND workspace=?", (cid, workspace)).rowcount > 0


def label() -> str:
    return "postgresql" if is_pg() else db_path().name
