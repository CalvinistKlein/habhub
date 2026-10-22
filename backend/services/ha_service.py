import urllib.request
import json
from backend.config import CONFIG
from backend.database import set_kv, get_kv

class HomeAssistantService:
    def __init__(self):
        self.config = CONFIG.get("home_assistant", {})

    def is_enabled(self):
        return bool(self.config.get("enabled", False) and self.config.get("access_token"))

    def toggle_light(self, entity_id="light.living_room"):
        """Toggles a light entity via Home Assistant REST API or local state store."""
        if not self.is_enabled():
            return self._toggle_virtual_state(entity_id)

        base_url = self.config.get("base_url", "http://homeassistant.local:8123").rstrip("/")
        token = self.config.get("access_token", "")
        url = f"{base_url}/api/services/light/toggle"

        payload = json.dumps({"entity_id": entity_id}).encode("utf-8")
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
                    return {"status": "success", "entity_id": entity_id, "mode": "ha_live"}
        except Exception as e:
            print(f"[HomeAssistantService] REST call failed: {e}. Falling back to virtual state.")

        return self._toggle_virtual_state(entity_id)

    def _toggle_virtual_state(self, entity_id):
        key = f"ha_state_{entity_id}"
        current = get_kv(key, {"state": "off", "brightness": 255})
        new_state = "off" if current.get("state") == "on" else "on"
        updated = {"state": new_state, "brightness": 216 if new_state == "on" else 0}
        set_kv(key, updated)
        return {"status": "success", "entity_id": entity_id, "state": new_state, "mode": "virtual"}

    def get_light_state(self, entity_id="light.living_room"):
        key = f"ha_state_{entity_id}"
        return get_kv(key, {"state": "off", "brightness": 0})

ha_service = HomeAssistantService()
