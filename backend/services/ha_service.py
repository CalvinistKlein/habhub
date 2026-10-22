import urllib.request
import json
from backend.config import CONFIG
from backend.database import set_kv, get_kv

class HomeAssistantService:
    def __init__(self):
        self.config = CONFIG.get("home_assistant", {})

    def is_enabled(self):
        cfg = CONFIG.get("home_assistant", {})
        return bool(cfg.get("enabled", False) and cfg.get("access_token"))

    def set_light_state(self, entity_id="light.living_room", state="on", brightness=255):
        """Sets a light entity state ('on' or 'off') via HA REST API or virtual store."""
        action = "turn_on" if state.lower() == "on" else "turn_off"

        if self.is_enabled():
            cfg = CONFIG.get("home_assistant", {})
            base_url = cfg.get("base_url", "http://homeassistant.local:8123").rstrip("/")
            token = cfg.get("access_token", "")
            url = f"{base_url}/api/services/light/{action}"

            payload_dict = {"entity_id": entity_id}
            if action == "turn_on" and brightness:
                payload_dict["brightness"] = brightness
            payload = json.dumps(payload_dict).encode("utf-8")

            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=4) as res:
                    if res.status in (200, 201):
                        self._save_virtual_state(entity_id, state.lower(), brightness)
                        return {"status": "success", "entity_id": entity_id, "state": state.lower(), "mode": "ha_live"}
            except Exception as e:
                print(f"[HomeAssistantService] REST call failed: {e}. Falling back to virtual state.")

        return self._save_virtual_state(entity_id, state.lower(), brightness)

    def toggle_light(self, entity_id="light.living_room"):
        """Toggles a light entity based on current known state."""
        current = self.get_light_state(entity_id)
        target_state = "off" if current.get("state") == "on" else "on"
        return self.set_light_state(entity_id, state=target_state)

    def _save_virtual_state(self, entity_id, state, brightness=255):
        key = f"ha_state_{entity_id}"
        updated = {"state": state, "brightness": brightness if state == "on" else 0}
        set_kv(key, updated)
        return {"status": "success", "entity_id": entity_id, "state": state, "mode": "virtual"}

    def get_light_state(self, entity_id="light.living_room"):
        # If live HA is enabled, try fetching entity state from /api/states/<entity_id>
        if self.is_enabled():
            cfg = CONFIG.get("home_assistant", {})
            base_url = cfg.get("base_url", "http://homeassistant.local:8123").rstrip("/")
            token = cfg.get("access_token", "")
            url = f"{base_url}/api/states/{entity_id}"
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=3) as res:
                    if res.status == 200:
                        data = json.loads(res.read().decode("utf-8"))
                        ha_state = data.get("state", "off").lower()
                        attrs = data.get("attributes", {})
                        bright = attrs.get("brightness", 255 if ha_state == "on" else 0)
                        self._save_virtual_state(entity_id, ha_state, bright)
                        return {"state": ha_state, "brightness": bright, "mode": "ha_live"}
            except Exception:
                pass

        key = f"ha_state_{entity_id}"
        return get_kv(key, {"state": "off", "brightness": 0, "mode": "virtual"})

ha_service = HomeAssistantService()
