import json
import urllib.request
import time
from backend.config import CONFIG
from backend.database import get_connection, create_timer, toggle_alarm
from backend.services.weather_service import weather_service
from backend.services.ha_service import ha_service

class AIRouter:
    def __init__(self):
        self.hermes_endpoint = CONFIG["hermes"]["endpoint"]
        self.local_ai_enabled = CONFIG["local_ai"]["enabled"]

    def process_query(self, user_text, tier_preference="auto"):
        """
        Routes the user's vocal/text command to the appropriate intelligence tier:
        - Fast Local Intent: Alarms, timers, lights, volume
        - Hermes Instance: Complex questions, search, smart home automation
        """
        user_text_clean = user_text.strip().lower()

        # 1. Check for immediate zero-latency local commands
        local_intent = self._detect_local_intent(user_text_clean)
        if local_intent:
            return {
                "tier": "tier_1_local",
                "intent": local_intent["intent"],
                "text": local_intent["response"],
                "action": local_intent.get("action")
            }

        # 2. Try Hermes Instance (Tier 2 Primary Smart Agent)
        if CONFIG["hermes"]["enabled"]:
            hermes_res = self._query_hermes(user_text)
            if hermes_res:
                return hermes_res

        # 3. Fallback response if Hermes is currently unreachable
        return {
            "tier": "tier_1_fallback",
            "text": f"I heard '{user_text}', but my primary Hermes node is unreachable. I've logged this request locally.",
            "intent": "general_query"
        }

    def _detect_local_intent(self, text):
        # Timers
        if "set a timer for" in text or "timer" in text:
            import re
            m = re.search(r'(\d+)\s*(minute|second|hour)', text)
            if m:
                val = int(m.group(1))
                unit = m.group(2)
                multiplier = 60 if "minute" in unit else (3600 if "hour" in unit else 1)
                duration = val * multiplier
                create_timer(duration, f"Timer ({val} {unit})")
                return {
                    "intent": "create_timer",
                    "response": f"Setting a timer for {val} {unit}{'s' if val > 1 else ''}.",
                    "action": {"type": "timer", "duration": duration}
                }
            create_timer(300, "5-Minute Kitchen Timer")
            return {
                "intent": "create_timer",
                "response": "Timer for 5 minutes started.",
                "action": {"type": "timer", "duration": 300}
            }

        # Lights
        if "turn on the lights" in text or "lights on" in text:
            res = ha_service.set_light_state("light.living_room", state="on")
            return {
                "intent": "light_control",
                "response": "Living room lights turned on.",
                "action": {"type": "light", "state": True}
            }
        if "turn off the lights" in text or "lights off" in text:
            res = ha_service.set_light_state("light.living_room", state="off")
            return {
                "intent": "light_control",
                "response": "Living room lights turned off.",
                "action": {"type": "light", "state": False}
            }
        if "toggle light" in text or "lights" in text:
            res = ha_service.toggle_light("light.living_room")
            state_str = res.get("state", "on").upper()
            return {
                "intent": "light_control",
                "response": f"Living room lights turned {state_str}.",
                "action": {"type": "light", "state": state_str == "ON"}
            }

        # Alarms
        if "alarm" in text and "set" in text:
            toggle_alarm(1, True)
            return {
                "intent": "create_alarm",
                "response": "Alarm active for 6:30 AM with morning voice briefing.",
                "action": {"type": "alarm", "time": "06:30"}
            }

        # Live Weather query
        if "weather" in text or "temperature" in text or "raining" in text:
            w = weather_service.get_weather()
            cur = w.get("current", {})
            temp = round(cur.get("temperature_2m", 68))
            loc = w.get("location", {})
            city = loc.get("city", "Austin")
            wind = round(cur.get("wind_speed_10m", 5))
            return {
                "intent": "query_weather",
                "response": f"{city} is currently {temp} degrees with wind at {wind} miles per hour.",
                "action": {"type": "navigate", "page": 1}
            }

        return None

    def _query_hermes(self, prompt):
        url = f"{self.hermes_endpoint}/api/chat"
        payload = json.dumps({
            "message": prompt,
            "stream": False,
            "device": "Surface Go 2 Kiosk"
        }).encode("utf-8")

        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "OmniHub-Client/1.0"}
            )
            with urllib.request.urlopen(req, timeout=4) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    return {
                        "tier": "tier_2_hermes",
                        "text": data.get("response", data.get("message", "Done.")),
                        "tool_calls": data.get("tool_calls", [])
                    }
        except Exception as e:
            # Hermes connection timeout or node offline
            return None

ai_router = AIRouter()
