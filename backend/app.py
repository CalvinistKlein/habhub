import os
import sys
import json
import mimetypes
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

# Add project root to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.config import CONFIG, save_config
from backend.database import init_db, get_alarms, set_kv, get_kv, backup_database, list_backups
from backend.services.weather_service import weather_service
from backend.services.media_service import media_service
from backend.services.ai_router import ai_router
from backend.services.voice_pipeline import voice_pipeline
from backend.services.updater_service import updater_service

FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class OmniHubRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        # API Endpoints
        if path == "/api/status":
            self._send_json({
                "status": "online",
                "device": "Surface Go 2",
                "os": "Linux 6.x",
                "hermes_connected": True,
                "piper_tts": "ready",
                "spotify_connect": "active" if media_service.state["is_active"] else "idle"
            })
            return

        elif path == "/api/weather":
            data = weather_service.get_weather()
            self._send_json(data)
            return

        elif path == "/api/weather/field":
            data = weather_service.get_weather_field()
            self._send_json(data)
            return

        elif path == "/api/settings":
            self._send_json({
                "screensaver": CONFIG.get("screensaver", {}),
                "map": CONFIG.get("map", {}),
                "media": {"default_backdrop_mode": CONFIG.get("media", {}).get("default_backdrop_mode", "photo")},
            })
            return

        elif path == "/api/media":
            data = media_service.get_playback_state()
            self._send_json(data)
            return

        elif path == "/api/alarms":
            data = get_alarms()
            self._send_json({"alarms": data})
            return

        elif path == "/api/location":
            self._send_json(CONFIG.get("location", {}))
            return

        elif path == "/api/system/version":
            data = updater_service.get_status()
            self._send_json(data)
            return

        elif path == "/api/system/reload_check":
            should_reload = updater_service.consume_reload_flag()
            self._send_json({"reload": should_reload})
            return

        elif path == "/api/system/backups":
            data = list_backups()
            self._send_json({"backups": data})
            return

        # Static Frontend File Serving
        self._serve_static(path)

    def do_POST(self):
        path = self.path.split("?")[0]
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            payload = json.loads(body)
        except Exception:
            payload = {}

        if path == "/api/media/toggle":
            data = media_service.toggle_playback()
            self._send_json(data)
            return

        elif path == "/api/media/next":
            data = media_service.next_track()
            self._send_json(data)
            return

        elif path == "/api/media/previous":
            data = media_service.previous_track()
            self._send_json(data)
            return

        elif path == "/api/media/seek":
            seconds = payload.get("seconds", 15)
            data = media_service.seek_relative(seconds)
            self._send_json(data)
            return

        elif path == "/api/media/event":
            data = media_service.handle_librespot_event(payload)
            self._send_json(data)
            return

        elif path == "/api/media/active":
            is_active = payload.get("active", True)
            data = media_service.set_active(is_active)
            self._send_json(data)
            return

        elif path == "/api/ai/chat":
            prompt = payload.get("message", "")
            response = ai_router.process_query(prompt)
            self._send_json(response)
            return

        elif path == "/api/voice/speak":
            text = payload.get("text", "")
            res = voice_pipeline.synthesize_speech(text)
            self._send_json({"synthesized": res, "text": text})
            return

        elif path == "/api/location":
            lat = payload.get("latitude")
            lon = payload.get("longitude")
            city = payload.get("city")
            state = payload.get("state")
            if lat and lon:
                if city and state:
                    updated = weather_service.set_location(city, state, lat, lon, source="manual")
                else:
                    updated = weather_service.reverse_geocode(lat, lon, source="gps")
                self._send_json({"status": "success", "location": updated})
            else:
                self._send_json({"status": "error", "message": "latitude and longitude required"}, status_code=400)
            return

        elif path == "/api/system/update":
            res = updater_service.trigger_update()
            self._send_json(res)
            return

        elif path == "/api/system/backup":
            label = payload.get("label", "manual")
            try:
                snapshot = backup_database(label=label)
                self._send_json({"status": "success", "backup_path": snapshot})
            except Exception as e:
                self._send_json({"status": "error", "message": str(e)}, status_code=500)
            return

        elif path == "/api/system/reload":
            updater_service.state["frontend_reload_flag"] = True
            self._send_json({"status": "success", "message": "Frontend reload signal set."})
            return

        self.send_error(404, "Endpoint Not Found")

    def _send_json(self, data, status_code=200):
        res = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(res)))
        self.end_headers()
        self.wfile.write(res)

    def _serve_static(self, path):
        if path in ["/", ""]:
            path = "/index.html"

        # Sanitize path
        safe_path = os.path.normpath(path.lstrip("/"))
        file_path = os.path.join(FRONTEND_DIR, safe_path)

        # Check if file exists inside FRONTEND_DIR
        if os.path.isfile(file_path) and os.path.abspath(file_path).startswith(FRONTEND_DIR):
            mime_type, _ = mimetypes.guess_type(file_path)
            mime_type = mime_type or "application/octet-stream"
            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_error(500, f"Error reading file: {e}")
                return

        self.send_error(404, f"File Not Found: {path}")

def run_server(port=8765):
    init_db()
    updater_service.start()
    server_address = ("0.0.0.0", port)
    httpd = ThreadedHTTPServer(server_address, OmniHubRequestHandler)
    print(f"=====================================================")
    print(f"  OmniHub Smart Display Backend Server Running")
    print(f"  URL: http://localhost:{port}")
    print(f"  Surface Go 2 Kiosk Serving from: {FRONTEND_DIR}")
    print(f"=====================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    port = CONFIG.get("server_port", 8765)
    run_server(port)
