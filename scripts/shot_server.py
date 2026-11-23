"""Tiny local receiver: the page POSTs canvas.toDataURL() and this writes the PNG, so it can be read as an image.

    python scripts/shot_server.py <out_dir> [port]
POST /?name=hero  (body = data URL)  ->  <out_dir>/hero.png
"""
import base64
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

OUT = Path(sys.argv[1])
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8799
OUT.mkdir(parents=True, exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        q = parse_qs(urlparse(self.path).query)
        name = "".join(c for c in q.get("name", ["shot"])[0] if c.isalnum() or c in "-_") or "shot"
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode()
        data = base64.b64decode(body.split(",", 1)[1])
        (OUT / f"{name}.png").write_bytes(data)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, *a):
        pass


HTTPServer(("127.0.0.1", PORT), H).serve_forever()
