#!/usr/bin/env python3
"""
J.A.R.V.I.S. local bridge server.

Serves dashboard.html and exposes a POST /ask endpoint that runs
your message through the local Claude Code CLI (`claude -p`) and
returns the reply as JSON. The dashboard's chat box and mic button
talk to this server.

Requirements:
- Python 3.8+
- Claude Code CLI installed and logged in (`claude` command available)

Run:
    python3 server.py
Then open:
    http://localhost:8765/dashboard.html
"""

import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 8765
DIRECTORY = Path(__file__).parent


class JarvisHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/ask":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length) if length else b"{}"

        try:
            data = json.loads(raw_body)
            message = data.get("message", "").strip()
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid json"})
            return

        if not message:
            self._send_json(400, {"error": "empty message"})
            return

        try:
            result = subprocess.run(
                ["claude", "-p", message],
                capture_output=True,
                text=True,
                timeout=120,
            )
            reply = result.stdout.strip() or "Keine Antwort erhalten."
        except FileNotFoundError:
            reply = "Claude Code CLI nicht gefunden. Installiere mit: npm install -g @anthropic-ai/claude-code"
        except subprocess.TimeoutExpired:
            reply = "Zeitüberschreitung — die Anfrage hat zu lange gedauert."
        except Exception as exc:
            reply = f"Fehler: {exc}"

        self._send_json(200, {"reply": reply})

    def do_GET(self):
        # Serve static files from this directory (dashboard.html, jarvis_data.js, etc.)
        requested = self.path.lstrip("/") or "dashboard.html"
        file_path = DIRECTORY / requested

        if not file_path.is_file():
            self._send_json(404, {"error": "not found"})
            return

        content_type = "text/html"
        if requested.endswith(".js"):
            content_type = "application/javascript"
        elif requested.endswith(".css"):
            content_type = "text/css"
        elif requested.endswith(".mp3"):
            content_type = "audio/mpeg"

        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[jarvis-server] {args[0]} {args[1]} {args[2]}")


if __name__ == "__main__":
    server = HTTPServer(("localhost", PORT), JarvisHandler)
    print(f"J.A.R.V.I.S. server running at http://localhost:{PORT}/dashboard.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
