import shutil
import subprocess
import threading
import time

from backend.config import CONFIG

SEP = "\x1f"
META_FORMAT = SEP.join([
    "{{status}}", "{{xesam:title}}", "{{xesam:artist}}", "{{xesam:album}}",
    "{{mpris:artUrl}}", "{{mpris:length}}", "{{position}}",
])


class MediaService:
    """
    Spotify Connect state + transport controls.

    Primary source: MPRIS over D-Bus via `playerctl` (works with spotifyd, or any
    Spotify Connect receiver exposing MPRIS). Secondary source: librespot's
    --onevent hook posting to /api/media/event (state only, no controls).

    The player is only reported as `visible` while music is playing, or for a
    short grace period after pausing so it can be resumed.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.player = CONFIG.get("media", {}).get("mpris_player", "spotifyd")
        self.grace = CONFIG.get("media", {}).get("paused_grace_seconds", 60)
        self.has_playerctl = shutil.which("playerctl") is not None
        self._last_poll = 0
        self.state = self._empty_state()

    def _empty_state(self):
        return {
            "source": "none",
            "is_active": False,
            "is_playing": False,
            "visible": False,
            "track": "",
            "artist": "",
            "album": "",
            "cover_url": "",
            "backdrop_url": "",
            "duration_seconds": 0,
            "position_seconds": 0,
            "paused_at": None,
            "last_updated": time.time(),
            "controls_available": self.has_playerctl if hasattr(self, "has_playerctl") else False,
        }

    # ------------------------------------------------------------------ playerctl

    def _playerctl(self, *args, timeout=3):
        if not self.has_playerctl:
            return None
        try:
            res = subprocess.run(["playerctl", "-p", self.player, *args],
                                 capture_output=True, text=True, timeout=timeout)
            return res.stdout.strip() if res.returncode == 0 else None
        except Exception:
            return None

    def _poll_mpris(self):
        out = self._playerctl("metadata", "--format", META_FORMAT)
        if not out:
            # Player not running -> no session
            if self.state["source"] == "mpris":
                self.state.update(self._empty_state())
            return
        parts = (out.split(SEP) + [""] * 7)[:7]
        status, title, artist, album, art, length_us, pos_us = parts
        playing = status.lower() == "playing"
        was_playing = self.state["is_playing"]
        self.state.update({
            "source": "mpris",
            "is_active": status.lower() in ("playing", "paused"),
            "is_playing": playing,
            "track": title,
            "artist": artist,
            "album": album,
            "cover_url": art,
            "backdrop_url": art,
            "duration_seconds": int(int(length_us or 0) / 1_000_000),
            "position_seconds": int(int(pos_us or 0) / 1_000_000),
            "last_updated": time.time(),
            "controls_available": True,
        })
        if playing:
            self.state["paused_at"] = None
        elif was_playing or self.state["paused_at"] is None:
            self.state["paused_at"] = time.time()

    # ------------------------------------------------------------------ public api

    def get_playback_state(self):
        with self._lock:
            now = time.time()
            if self.has_playerctl and now - self._last_poll > 1.0:
                self._last_poll = now
                self._poll_mpris()

            s = self.state
            # Advance position locally for event-hook sources
            if s["source"] == "librespot" and s["is_playing"]:
                elapsed = now - s["last_updated"]
                s["position_seconds"] = min(s["duration_seconds"] or 10**9,
                                            s["position_seconds"] + int(elapsed))
                s["last_updated"] = now - (elapsed % 1)

            paused_recently = (s["paused_at"] is not None and now - s["paused_at"] < self.grace)
            s["visible"] = bool(s["is_active"] and (s["is_playing"] or paused_recently) and s["track"])
            return dict(s)

    def handle_librespot_event(self, ev):
        """Accepts librespot --onevent environment variables (PLAYER_EVENT, NAME, ...)."""
        with self._lock:
            event = (ev.get("PLAYER_EVENT") or "").lower()
            s = self.state
            s["source"] = "librespot"
            if event in ("track_changed", "changed"):
                covers = (ev.get("COVERS") or "").split("\n")
                s.update({
                    "track": ev.get("NAME", s["track"]),
                    "artist": ", ".join(filter(None, (ev.get("ARTISTS") or "").split("\n"))) or s["artist"],
                    "album": ev.get("ALBUM", s["album"]),
                    "cover_url": covers[0] if covers and covers[0] else s["cover_url"],
                    "backdrop_url": covers[0] if covers and covers[0] else s["backdrop_url"],
                    "duration_seconds": int(int(ev.get("DURATION_MS") or 0) / 1000),
                })
            if event in ("playing", "started"):
                s["is_active"] = True
                s["is_playing"] = True
                s["paused_at"] = None
            elif event == "paused":
                s["is_playing"] = False
                s["paused_at"] = time.time()
            elif event in ("stopped", "session_disconnected"):
                self.state = self._empty_state()
                return self.state
            if ev.get("POSITION_MS"):
                s["position_seconds"] = int(int(ev["POSITION_MS"]) / 1000)
            s["last_updated"] = time.time()
            return dict(s)

    def _control(self, *args):
        if self._playerctl(*args) is None and not self.has_playerctl:
            print(f"[MediaService] Control '{' '.join(args)}' unavailable (install playerctl + spotifyd).")
        self._last_poll = 0
        time.sleep(0.25)
        return self.get_playback_state()

    def toggle_playback(self):
        return self._control("play-pause")

    def next_track(self):
        return self._control("next")

    def previous_track(self):
        return self._control("previous")

    def seek_relative(self, seconds):
        seconds = int(seconds)
        return self._control("position", f"{abs(seconds)}{'+' if seconds >= 0 else '-'}")

    def set_active(self, is_active):
        with self._lock:
            if not is_active:
                self.state = self._empty_state()
        return self.get_playback_state()


media_service = MediaService()
