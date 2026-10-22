import json
import math
import threading
import time
import urllib.request

from backend.config import CONFIG, save_config

USER_AGENT = {"User-Agent": "OmniHub-Display/1.0"}


def _get_json(url, timeout=10):
    req = urllib.request.Request(url, headers=USER_AGENT)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


class WeatherService:
    """
    Local weather (Open-Meteo, no API key) plus a regional weather grid that
    drives the living map: cloud cover, precipitation, snow and wind sampled
    on a lat/lon grid covering ~100+ miles around the display.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.cached_weather = None
        self.last_weather_fetch = 0
        self.weather_cache_ttl = 600  # 10 minutes

        self.cached_field = None
        self.last_field_fetch = 0
        self.field_cache_ttl = 600

        self.cached_radar = None
        self.last_radar_fetch = 0
        self.radar_cache_ttl = 180  # 3 minutes for radar sweeps

        loc = CONFIG.get("location", {})
        # Browser GPS fixes are more precise than IP lookups; don't overwrite them on boot
        if loc.get("auto_detect", True) and loc.get("source") != "gps":
            threading.Thread(target=self.auto_detect_location, daemon=True).start()

    # ------------------------------------------------------------------ location

    def auto_detect_location(self):
        """Resolve city / region / coordinates from the public IP address."""
        for url in ("http://ip-api.com/json", "https://ipapi.co/json/"):
            try:
                data = _get_json(url, timeout=5)
                city = data.get("city")
                region = data.get("regionName") or data.get("region") or data.get("region_code")
                lat = data.get("lat") or data.get("latitude")
                lon = data.get("lon") or data.get("longitude")
                if city and lat is not None and lon is not None:
                    print(f"[WeatherService] IP location: {city}, {region} ({lat}, {lon})")
                    self.set_location(city, region or "", lat, lon, source="ip")
                    return True
            except Exception:
                continue
        print("[WeatherService] IP geolocation unavailable; using saved location.")
        return False

    def set_location(self, city, state, lat, lon, source="manual"):
        loc = CONFIG.setdefault("location", {})
        loc.update({
            "city": str(city),
            "state": str(state),
            "latitude": round(float(lat), 4),
            "longitude": round(float(lon), 4),
            "source": source,
        })
        save_config(CONFIG)
        with self._lock:
            self.cached_weather = None
            self.cached_field = None
        return loc

    def reverse_geocode(self, lat, lon, source="gps"):
        try:
            data = _get_json(
                f"https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat={lat}&lon={lon}",
                timeout=5,
            )
            addr = data.get("address", {})
            city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or "Local"
            state = addr.get("state") or addr.get("country") or ""
            return self.set_location(city, state, lat, lon, source=source)
        except Exception:
            return self.set_location(CONFIG["location"].get("city", "Local"),
                                     CONFIG["location"].get("state", ""), lat, lon, source=source)

    # ------------------------------------------------------------------ forecast

    def get_weather(self):
        now = time.time()
        with self._lock:
            if self.cached_weather and now - self.last_weather_fetch < self.weather_cache_ttl:
                return self.cached_weather

        lat = CONFIG["location"]["latitude"]
        lon = CONFIG["location"]["longitude"]
        url = (
            "https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            "current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,"
            "rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&"
            "hourly=temperature_2m,precipitation_probability,weather_code,is_day&"
            "daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&"
            "temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&"
            "timeformat=unixtime&timezone=auto&forecast_days=2"
        )
        try:
            data = _get_json(url)
            data["location"] = CONFIG["location"]
            data["source"] = "live"
            with self._lock:
                self.cached_weather = data
                self.last_weather_fetch = now
            return data
        except Exception as e:
            print(f"[WeatherService] Open-Meteo fetch error: {e}")
            with self._lock:
                if self.cached_weather:
                    return self.cached_weather
            return self._fallback_weather()

    # ------------------------------------------------------------------ regional grid

    def get_weather_field(self, cols=7, rows=5):
        """
        Samples current conditions on a cols x rows grid. Each value is the centre
        of a cell; bbox gives the outer cell edges so the frontend can stretch the
        grid over the map with bilinear smoothing.
        """
        now = time.time()
        with self._lock:
            if self.cached_field and now - self.last_field_fetch < self.field_cache_ttl:
                return self.cached_field

        lat0 = float(CONFIG["location"]["latitude"])
        lon0 = float(CONFIG["location"]["longitude"])
        radius = float(CONFIG.get("map", {}).get("radius_miles", 100)) * 1.6  # cover screen corners
        half_lat = radius / 69.0
        half_lon = radius / (69.0 * max(0.2, math.cos(math.radians(lat0))))
        bbox = {"north": lat0 + half_lat, "south": lat0 - half_lat,
                "west": lon0 - half_lon, "east": lon0 + half_lon}

        cell_lat = (bbox["north"] - bbox["south"]) / rows
        cell_lon = (bbox["east"] - bbox["west"]) / cols
        lats, lons = [], []
        for r in range(rows):
            for c in range(cols):
                lats.append(round(bbox["north"] - (r + 0.5) * cell_lat, 3))
                lons.append(round(bbox["west"] + (c + 0.5) * cell_lon, 3))

        url = (
            "https://api.open-meteo.com/v1/forecast?"
            f"latitude={','.join(map(str, lats))}&longitude={','.join(map(str, lons))}&"
            "current=cloud_cover,cloud_cover_low,cloud_cover_high,precipitation,snowfall,"
            "weather_code,wind_speed_10m,wind_direction_10m&"
            "wind_speed_unit=mph&precipitation_unit=inch&timezone=auto"
        )
        try:
            raw = _get_json(url, timeout=12)
            if isinstance(raw, dict):
                raw = [raw]
            cells = []
            for item in raw:
                cur = item.get("current", {})
                cells.append({
                    "cloud": cur.get("cloud_cover", 0) or 0,
                    "low": cur.get("cloud_cover_low", 0) or 0,
                    "high": cur.get("cloud_cover_high", 0) or 0,
                    "precip": cur.get("precipitation", 0) or 0,
                    "snow": cur.get("snowfall", 0) or 0,
                    "code": cur.get("weather_code", 0) or 0,
                    "wind_speed": cur.get("wind_speed_10m", 0) or 0,
                    "wind_dir": cur.get("wind_direction_10m", 0) or 0,
                })
            field = {"bbox": bbox, "cols": cols, "rows": rows, "cells": cells,
                     "source": "live", "fetched_at": now}
            with self._lock:
                self.cached_field = field
                self.last_field_fetch = now
            return field
        except Exception as e:
            print(f"[WeatherService] Weather grid fetch error: {e}")
            with self._lock:
                if self.cached_field:
                    return self.cached_field
            return self._fallback_field(bbox, cols, rows)

    # ------------------------------------------------------------------ rainviewer radar

    def get_radar_frames(self):
        """
        Fetches live radar frame timestamps from RainViewer free API.
        Enables seamless Doppler precipitation overlay on the 100-mile living map.
        """
        now = time.time()
        with self._lock:
            if self.cached_radar and now - self.last_radar_fetch < self.radar_cache_ttl:
                return self.cached_radar

        url = "https://api.rainviewer.com/public/weather-maps.json"
        try:
            raw = _get_json(url, timeout=8)
            host = raw.get("host", "https://tilecache.rainviewer.com")
            radar_dict = raw.get("radar", {})
            past_frames = radar_dict.get("past", [])
            nowcast_frames = radar_dict.get("nowcast", [])
            latest_frame = past_frames[-1] if past_frames else None

            radar_data = {
                "host": host,
                "latest": latest_frame,
                "past": past_frames[-6:],  # keep last 6 frames for loop
                "nowcast": nowcast_frames[:4],
                "fetched_at": now,
                "source": "live"
            }
            with self._lock:
                self.cached_radar = radar_data
                self.last_radar_fetch = now
            return radar_data
        except Exception as e:
            print(f"[WeatherService] RainViewer fetch warning: {e}")
            with self._lock:
                if self.cached_radar:
                    return self.cached_radar
            return {"host": "https://tilecache.rainviewer.com", "latest": None, "past": [], "source": "unavailable"}

    # ------------------------------------------------------------------ offline fallbacks

    def _fallback_weather(self):
        now = int(time.time())
        hour = now - now % 3600
        return {
            "source": "fallback",
            "current": {
                "temperature_2m": 68.0, "apparent_temperature": 67.0, "relative_humidity_2m": 65,
                "precipitation": 0.0, "weather_code": 2, "cloud_cover": 45, "is_day": 1,
                "wind_speed_10m": 7.0, "wind_direction_10m": 225,
            },
            "hourly": {
                "time": [hour + i * 3600 for i in range(24)],
                "temperature_2m": [68 - (i % 12) * 0.5 for i in range(24)],
                "precipitation_probability": [10] * 24,
                "weather_code": [2] * 24,
                "is_day": [1] * 24,
            },
            "daily": {"temperature_2m_max": [74], "temperature_2m_min": [58],
                      "precipitation_probability_max": [10], "weather_code": [2]},
            "location": CONFIG["location"],
        }

    def _fallback_field(self, bbox, cols, rows):
        cells = []
        for r in range(rows):
            for c in range(cols):
                cover = 30 + 40 * math.sin((c + r) * 0.9) ** 2
                cells.append({"cloud": cover, "low": cover * 0.6, "high": 20, "precip": 0,
                              "snow": 0, "code": 2, "wind_speed": 8, "wind_dir": 225})
        return {"bbox": bbox, "cols": cols, "rows": rows, "cells": cells, "source": "fallback"}


weather_service = WeatherService()
