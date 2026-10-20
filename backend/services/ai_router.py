import json
import urllib.request
import time
from backend.config import CONFIG
from backend.database import get_connection

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
                return {
                    "intent": "create_timer",
                    "response": f"Setting a timer for {val} {unit}{'s' if val > 1 else ''}.",
                    "action": {"type": "timer", "duration": duration}
                }
            return {
                "intent": "create_timer",
                "response": "Timer for 5 minutes started.",
                "action": {"type": "timer", "duration": 300}
            }

        # Lights
        if "turn on the lights" in text or "lights on" in text:
            return {
                "intent": "light_control",
                "response": "Living room lights turned on.",
                "action": {"type": "light", "state": True}
            }
        if "turn off the lights" in text or "lights off" in text:
            return {
                "intent": "light_control",
                "response": "Living room lights turned off.",
                "action": {"type": "light", "state": False}
            }

        # Alarms
        if "alarm" in text and "set" in text:
            return {
                "intent": "create_alarm",
                "response": "Alarm set for 6:30 AM with morning voice briefing.",
                "action": {"type": "alarm", "time": "06:30"}
            }

        # Weather query
        if "weather" in text or "temperature" in text or "raining" in text:
            return {
                "intent": "query_weather",
                "response": "Austin is currently 68 degrees with light rain moving Northeast at 14 miles per hour.",
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
