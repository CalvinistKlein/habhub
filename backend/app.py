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
from backend.database import (
    init_db, get_alarms, toggle_alarm, get_timers, create_timer,
    delete_timer, clear_timers, set_kv, get_kv, backup_database, list_backups
)
from backend.services.weather_service import weather_service
from backend.services.media_service import media_service
from backend.services.ai_router import ai_router
from backend.services.voice_pipeline import voice_pipeline
from backend.services.updater_service import updater_service
from backend.services.ha_service import ha_service

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

        elif path == "/api/weather/radar":
            data = weather_service.get_radar_frames()
            self._send_json(data)
            return

        elif path == "/api/lights/state":
            data = ha_service.get_light_state()
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

        elif path == "/api/timers":
            data = get_timers()
            self._send_json({"timers": data})
            return

        elif path == "/api/system/check_update":
            data = updater_service.check_for_updates()
            status = updater_service.get_status()
            self._send_json(status)
            return

        elif path == "/api/photos":
            pictures_dir = os.path.expanduser("~/Pictures")
            photos = []
            if os.path.exists(pictures_dir):
                valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
                for root, _, files in os.walk(pictures_dir):
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in valid_exts and not f.startswith("."):
                            rel = os.path.relpath(os.path.join(root, f), pictures_dir)
                            photos.append({
                                "url": f"/api/photos/asset/{rel}",
                                "title": os.path.splitext(f)[0]
                            })
                            if len(photos) >= 50:
                                break
                    if len(photos) >= 50:
                        break
            self._send_json({"photos": photos})
            return

        elif path.startswith("/api/photos/asset/"):
            rel_path = path[len("/api/photos/asset/"):]
            pictures_dir = os.path.expanduser("~/Pictures")
            full_path = os.path.normpath(os.path.join(pictures_dir, rel_path))
            if os.path.isfile(full_path) and os.path.abspath(full_path).startswith(os.path.abspath(pictures_dir)):
                mime, _ = mimetypes.guess_type(full_path)
                try:
                    with open(full_path, "rb") as f:
                        buf = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", mime or "image/jpeg")
                    self.send_header("Content-Length", str(len(buf)))
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.end_headers()
                    self.wfile.write(buf)
                    return
                except Exception as e:
                    self.send_error(500, f"Error: {e}")
                    return
            self.send_error(404, "Photo Not Found")
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

        elif path == "/api/lights/toggle":
            entity_id = payload.get("entity_id", "light.living_room")
            res = ha_service.toggle_light(entity_id)
            self._send_json(res)
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

        elif path == "/api/photos":
            pictures_dir = os.path.expanduser("~/Pictures")
            photos = []
            if os.path.exists(pictures_dir):
                valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
                for root, _, files in os.walk(pictures_dir):
                    for f in files:
                        ext = os.path.splitext(f)[1].lower()
                        if ext in valid_exts and not f.startswith("."):
                            rel = os.path.relpath(os.path.join(root, f), pictures_dir)
                            photos.append({
                                "url": f"/api/photos/asset/{rel}",
                                "title": os.path.splitext(f)[0]
                            })
                            if len(photos) >= 50:
                                break
                    if len(photos) >= 50:
                        break
            self._send_json({"photos": photos})
            return

        elif path.startswith("/api/photos/asset/"):
            rel_path = path[len("/api/photos/asset/"):]
            pictures_dir = os.path.expanduser("~/Pictures")
            full_path = os.path.normpath(os.path.join(pictures_dir, rel_path))
            if os.path.isfile(full_path) and os.path.abspath(full_path).startswith(os.path.abspath(pictures_dir)):
                mime, _ = mimetypes.guess_type(full_path)
                try:
                    with open(full_path, "rb") as f:
                        buf = f.read()
                    self.send_response(200)
                    self.send_header("Content-Type", mime or "image/jpeg")
                    self.send_header("Content-Length", str(len(buf)))
                    self.send_header("Cache-Control", "public, max-age=3600")
                    self.end_headers()
                    self.wfile.write(buf)
                    return
                except Exception as e:
                    self.send_error(500, f"Error: {e}")
                    return
            self.send_error(404, "Photo Not Found")
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

        elif path == "/api/alarms/toggle":
            alarm_id = payload.get("id", 1)
            enabled = payload.get("enabled", None)
            alarm = toggle_alarm(alarm_id, enabled)
            self._send_json({"status": "success", "alarm": alarm})
            return

        elif path == "/api/timers":
            duration = payload.get("duration", 300)
            label = payload.get("label", "Kitchen Timer")
            timer = create_timer(duration, label)
            self._send_json({"status": "success", "timer": timer})
            return

        elif path == "/api/timers/delete":
            timer_id = payload.get("id")
            if timer_id:
                delete_timer(timer_id)
            else:
                clear_timers()
            self._send_json({"status": "success"})
            return

        elif path == "/api/system/update":
            res = updater_service.trigger_update()
            self._send_json(res)
            return

        elif path == "/api/system/restart":
            updater_service.schedule_restart(delay_seconds=1.0)
            self._send_json({"status": "success", "message": "OmniHub service is restarting."})
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
