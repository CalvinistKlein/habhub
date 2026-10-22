import unittest
import os
import sys
import tempfile
import json
import time

# Ensure project root is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.database import (
    init_db, get_connection, create_alarm, get_alarms, toggle_alarm,
    create_timer, get_timers, clear_timers, set_kv, get_kv, backup_database
)
from backend.services.ha_service import ha_service
from backend.services.ai_router import AIRouter
from backend.services.alarm_service import AlarmService
from backend.services.immich_service import immich_service
from backend.services.weather_service import weather_service

class TestOmniHub(unittest.TestCase):
    def setUp(self):
        init_db()

    def test_database_crud(self):
        # Key-Value store
        set_kv("test_key", {"foo": "bar", "val": 42})
        val = get_kv("test_key")
        self.assertEqual(val.get("foo"), "bar")
        self.assertEqual(val.get("val"), 42)

        # Alarms
        alarm_id = create_alarm("07:00", "Work Alarm", "1,2,3,4,5", 1)
        self.assertIsNotNone(alarm_id)
        alarms = get_alarms()
        self.assertTrue(any(a["time_str"] == "07:00" for a in alarms))

        # Toggle alarm
        res = toggle_alarm(alarm_id, False)
        self.assertEqual(res.get("enabled"), 0)

        # Timers
        t_id = create_timer(180, "Tea Timer")
        timers = get_timers()
        self.assertTrue(any(t["label"] == "Tea Timer" for t in timers))
        clear_timers()
        self.assertEqual(len(get_timers()), 0)

    def test_database_backup(self):
        backup_path = backup_database(label="unit_test")
        self.assertTrue(os.path.exists(backup_path))
        self.assertTrue(backup_path.endswith(".db"))

    def test_ha_service(self):
        # Virtual mode test
        res = ha_service.set_light_state("light.test_lamp", state="on", brightness=200)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["state"], "on")

        state = ha_service.get_light_state("light.test_lamp")
        self.assertEqual(state["state"], "on")

        toggle_res = ha_service.toggle_light("light.test_lamp")
        self.assertEqual(toggle_res["state"], "off")

    def test_ai_router_local_intents(self):
        router = AIRouter()

        # Turn on lights
        res = router.process_query("turn on the lights")
        self.assertEqual(res["tier"], "tier_1_local")
        self.assertEqual(res["intent"], "light_control")
        self.assertTrue(res["action"]["state"])

        # Turn off lights
        res = router.process_query("turn off the lights")
        self.assertEqual(res["tier"], "tier_1_local")
        self.assertEqual(res["intent"], "light_control")
        self.assertFalse(res["action"]["state"])

        # Timers
        res = router.process_query("set a timer for 10 minutes")
        self.assertEqual(res["intent"], "create_timer")
        self.assertEqual(res["action"]["duration"], 600)

        # Alarms
        res = router.process_query("set my morning alarm")
        self.assertEqual(res["intent"], "create_alarm")

    def test_alarm_service(self):
        svc = AlarmService()
        state = svc.get_state()
        self.assertFalse(state["is_ringing"])
        self.assertIsNone(state["active_alarm"])

        # Fake trigger
        svc._trigger_alarm({"id": 99, "time_str": "06:30", "label": "Test Alarm", "voice_briefing": False})
        state = svc.get_state()
        self.assertTrue(state["is_ringing"])
        self.assertEqual(state["active_alarm"]["label"], "Test Alarm")

        # Dismiss
        svc.dismiss()
        state = svc.get_state()
        self.assertFalse(state["is_ringing"])

        # Snooze test
        svc._trigger_alarm({"id": 100, "time_str": "07:00", "label": "Snooze Test", "voice_briefing": False})
        snooze_res = svc.snooze(minutes=5)
        self.assertEqual(snooze_res["status"], "snoozed")
        self.assertFalse(svc.get_state()["is_ringing"])
        self.assertIsNotNone(svc.get_state()["snoozed_until"])

    def test_weather_service_fallback(self):
        fb = weather_service._fallback_weather()
        self.assertIn("current", fb)
        self.assertIn("temperature_2m", fb["current"])
        self.assertIn("hourly", fb)

    def test_immich_service_cache(self):
        # When disabled, returns empty list without error
        photos = immich_service.fetch_photos(limit=5)
        self.assertIsInstance(photos, list)

if __name__ == "__main__":
    unittest.main()
