import time
import threading
from datetime import datetime, timedelta
from backend.config import CONFIG
from backend.database import get_alarms, toggle_alarm
from backend.services.voice_pipeline import voice_pipeline

class AlarmService:
    def __init__(self):
        self._running = False
        self._thread = None
        self.active_alarm = None
        self._last_triggered_minute = None
        self.snooze_alarm = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print("[AlarmService] Background alarm watcher running.")

    def _loop(self):
        while self._running:
            try:
                self._check_alarms()
            except Exception as e:
                print(f"[AlarmService] Error checking alarms: {e}")
            time.sleep(5)

    def _check_alarms(self):
        now = datetime.now()
        current_time_str = now.strftime("%H:%M")
        current_minute_key = now.strftime("%Y-%m-%d %H:%M")
        # Python weekday: Monday is 0, Sunday is 6. In our DB, 1=Mon, 2=Tue, ..., 7=Sun
        current_day_num = str(now.isoweekday())

        if self._last_triggered_minute == current_minute_key:
            return  # Already fired this minute

        # 1. Check temporary snooze alarm
        if self.snooze_alarm and self.snooze_alarm.get("time_str") == current_time_str:
            self._last_triggered_minute = current_minute_key
            alarm_to_fire = self.snooze_alarm
            self.snooze_alarm = None
            self._trigger_alarm(alarm_to_fire)
            return

        # 2. Check persistent database alarms
        alarms = get_alarms()
        for a in alarms:
            if not a.get("enabled"):
                continue

            alarm_time = a.get("time_str", "")
            active_days = [d.strip() for d in (a.get("days") or "1,2,3,4,5").split(",")]

            if alarm_time == current_time_str and current_day_num in active_days:
                self._last_triggered_minute = current_minute_key
                self._trigger_alarm(a)
                break

    def _trigger_alarm(self, alarm):
        sound = CONFIG.get("alarms", {}).get("sound", "gentle_chime")
        print(f"[AlarmService] ALARM TRIGGERED: {alarm.get('label')} at {alarm.get('time_str')} (Sound: {sound})")
        self.active_alarm = {
            "id": alarm.get("id"),
            "time_str": alarm.get("time_str"),
            "label": alarm.get("label", "Morning Alarm"),
            "sound": sound,
            "triggered_at": time.time()
        }

        # Vocal briefing if enabled
        if alarm.get("voice_briefing"):
            def _speak():
                time.sleep(1.5)
                briefing = voice_pipeline.generate_morning_briefing()
                voice_pipeline.synthesize_speech(briefing)

            threading.Thread(target=_speak, daemon=True).start()

    def dismiss(self):
        if self.active_alarm:
            print(f"[AlarmService] Alarm dismissed: {self.active_alarm.get('label')}")
            self.active_alarm = None
            return True
        return False

    def snooze(self, minutes=None):
        if minutes is None:
            minutes = CONFIG.get("alarms", {}).get("snooze_minutes", 5)
        if self.active_alarm:
            target_time = (datetime.now() + timedelta(minutes=minutes)).strftime("%H:%M")
            orig_label = self.active_alarm.get("label", "Alarm")
            print(f"[AlarmService] Alarm snoozed for {minutes}m until {target_time}")
            self.snooze_alarm = {
                "id": -1,
                "time_str": target_time,
                "label": f"Snoozed ({orig_label})",
                "voice_briefing": False,
                "enabled": 1,
                "days": "1,2,3,4,5,6,7"
            }
            self.active_alarm = None
            return {"status": "snoozed", "until": target_time, "minutes": minutes}
        return {"status": "no_active_alarm"}

    def get_state(self):
        sound = CONFIG.get("alarms", {}).get("sound", "gentle_chime")
        return {
            "active_alarm": self.active_alarm,
            "is_ringing": self.active_alarm is not None,
            "sound": sound,
            "snoozed_until": self.snooze_alarm.get("time_str") if self.snooze_alarm else None
        }

alarm_service = AlarmService()
