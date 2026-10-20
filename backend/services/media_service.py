import time
from backend.config import CONFIG

class MediaService:
    def __init__(self):
        self.state = {
            "is_active": True, # Whether Spotify Connect has an active session
            "is_playing": True,
            "track": "Weightless",
            "artist": "Marconi Union • Transmissions Vol. 2",
            "device": "Surface Go 2 • Living Room",
            "cover_url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80",
            "backdrop_url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=2560&q=85",
            "duration_seconds": 480, # 8:00
            "position_seconds": 108, # 1:48
            "is_dark_like_yosemite": True,
            "last_updated": time.time()
        }

    def get_playback_state(self):
        # Update progressive position if playing
        if self.state["is_playing"]:
            now = time.time()
            elapsed = now - self.state["last_updated"]
            if elapsed >= 1.0:
                self.state["position_seconds"] = min(
                    self.state["duration_seconds"],
                    self.state["position_seconds"] + int(elapsed)
                )
                self.state["last_updated"] = now
        return self.state

    def play(self):
        self.state["is_playing"] = True
        self.state["last_updated"] = time.time()
        return self.state

    def pause(self):
        self.state["is_playing"] = False
        return self.state

    def toggle_playback(self):
        self.state["is_playing"] = not self.state["is_playing"]
        self.state["last_updated"] = time.time()
        return self.state

    def next_track(self):
        if self.state["track"] == "Weightless":
            self.state.update({
                "track": "Dayvan Cowboy",
                "artist": "Boards of Canada • The Campfire Headphase",
                "cover_url": "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=600&q=80",
                "backdrop_url": "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=2560&q=85",
                "duration_seconds": 301,
                "position_seconds": 0,
                "is_dark_like_yosemite": False,
                "last_updated": time.time()
            })
        else:
            self.state.update({
                "track": "Weightless",
                "artist": "Marconi Union • Transmissions Vol. 2",
                "cover_url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80",
                "backdrop_url": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=2560&q=85",
                "duration_seconds": 480,
                "position_seconds": 0,
                "is_dark_like_yosemite": True,
                "last_updated": time.time()
            })
        return self.state

    def previous_track(self):
        if self.state["position_seconds"] > 5:
            self.state["position_seconds"] = 0
        else:
            return self.next_track()
        self.state["last_updated"] = time.time()
        return self.state

    def seek_relative(self, seconds):
        self.state["position_seconds"] = max(
            0, min(self.state["duration_seconds"], self.state["position_seconds"] + seconds)
        )
        self.state["last_updated"] = time.time()
        return self.state

    def set_active(self, is_active):
        self.state["is_active"] = is_active
        return self.state

media_service = MediaService()
