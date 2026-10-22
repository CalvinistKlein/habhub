import time
import threading
from datetime import datetime
from backend.database import get_alarms, toggle_alarm
from backend.services.voice_pipeline import voice_pipeline

class AlarmService:
    def __init__(self):
        self._running = False
        self._thread = None
        self.active_alarm = None
        self._last_triggered_minute = None

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
        print(f"[AlarmService] ALARM TRIGGERED: {alarm.get('label')} at {alarm.get('time_str')}")
        self.active_alarm = {
            "id": alarm.get("id"),
            "time_str": alarm.get("time_str"),
            "label": alarm.get("label", "Morning Alarm"),
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

    def get_state(self):
        return {
            "active_alarm": self.active_alarm,
            "is_ringing": self.active_alarm is not None
        }

alarm_service = AlarmService()
