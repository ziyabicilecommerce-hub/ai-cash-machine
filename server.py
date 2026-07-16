#!/usr/bin/env python3
"""
J.A.R.V.I.S. local bridge server.

Serves dashboard.html and exposes a POST /ask endpoint that sends
your message to the Anthropic API (using your own API key) and
returns the reply as JSON. The dashboard's chat box and mic button
talk to this server.

Requirements:
- Python 3.8+
- An Anthropic API key from https://console.anthropic.com

Setup:
    macOS/Linux:
        export ANTHROPIC_API_KEY="sk-ant-your-key-here"
        python3 server.py

    Windows (PowerShell):
        $env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
        python server.py

Then open:
    http://localhost:8765/dashboard.html

Note: this bills your Anthropic Console balance per request (pay-as-you-go
API pricing), separate from a Claude Pro/Max subscription.
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 8765
DIRECTORY = Path(__file__).parent
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"
API_KEY = os.environ.get("ANTHROPIC_API_KEY")

JARVIS_SYSTEM_PROMPT = (
    "You are J.A.R.V.I.S., a witty, composed British AI assistant running "
    "a business command center dashboard. Keep replies short (2-4 sentences), "
    "helpful, and address the user respectfully."
)


def call_anthropic(message: str) -> str:
    if not API_KEY:
        return (
            "Kein ANTHROPIC_API_KEY gesetzt. Setze ihn in deinem Terminal mit "
            "'export ANTHROPIC_API_KEY=\"sk-ant-...\"' und starte server.py neu."
        )

    payload = json.dumps({
        "model": MODEL,
        "max_tokens": 300,
        "system": JARVIS_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": message}],
    }).encode("utf-8")

    request = urllib.request.Request(
        ANTHROPIC_API_URL,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
            parts = body.get("content", [])
            text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
            return text.strip() or "Keine Antwort erhalten."
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        if exc.code == 401:
            return "API-Key ungültig. Prüfe ANTHROPIC_API_KEY in deinem Terminal."
        if exc.code == 429:
            return "Rate-Limit erreicht oder Guthaben aufgebraucht. Prüfe dein Konto auf console.anthropic.com."
        return f"API-Fehler ({exc.code}): {detail[:200]}"
    except urllib.error.URLError as exc:
        return f"Netzwerkfehler: {exc.reason}"
    except Exception as exc:
        return f"Fehler: {exc}"


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

        reply = call_anthropic(message)
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
    if not API_KEY:
        print("WARNUNG: ANTHROPIC_API_KEY ist nicht gesetzt.")
        print('Setze ihn mit: export ANTHROPIC_API_KEY="sk-ant-..."')
        print()

    server = HTTPServer(("localhost", PORT), JarvisHandler)
    print(f"J.A.R.V.I.S. server running at http://localhost:{PORT}/dashboard.html")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
