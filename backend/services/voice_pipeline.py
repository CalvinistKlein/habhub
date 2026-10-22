import os
import subprocess
import json
import time
from backend.config import CONFIG

class VoicePipeline:
    def __init__(self):
        self.wake_word = CONFIG["voice"]["wake_word"]
        self.piper_voice = CONFIG["voice"]["piper_voice"]
        self.is_listening = True

    def synthesize_speech(self, text, output_file=None):
        """
        Uses Piper TTS to synthesize local high-fidelity speech.
        If Piper binary is not installed yet on the system, gracefully logs text
        and provides audio briefing string.
        """
        print(f"[VoicePipeline / Piper TTS] Vocalizing: '{text}'")
        
        # Check if piper binary is installed in path
        piper_path = subprocess.run(["which", "piper"], capture_output=True, text=True).stdout.strip()
        if piper_path and os.path.exists(piper_path):
            try:
                cmd = f"echo '{text}' | piper --model {self.piper_voice} --output-raw | aplay -r 22050 -f S16_LE -t raw -"
                subprocess.Popen(cmd, shell=True)
                return True
            except Exception as e:
                print(f"[VoicePipeline] Piper execution error: {e}")
        return False

    def generate_morning_briefing(self, weather_data=None):
        """
        Compiles the morning Piper briefing for the 6:30 AM alarm with live weather.
        """
        if not weather_data:
            try:
                from backend.services.weather_service import weather_service
                weather_data = weather_service.get_weather()
            except Exception:
                weather_data = {}

        cur = weather_data.get("current", {}) if weather_data else {}
        temp = str(round(cur.get("temperature_2m", 68)))
        loc = weather_data.get("location", {}) if weather_data else {}
        city = loc.get("city", "Austin")
        wind = round(cur.get("wind_speed_10m", 5))

        briefing = (
            f"Good morning. It is 6:30 AM. Current temperature in {city} is {temp} degrees "
            f"with wind at {wind} miles per hour. "
            f"Living room lights are set. Have a wonderful and productive day."
        )
        return briefing

voice_pipeline = VoicePipeline()
