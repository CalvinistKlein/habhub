import urllib.request
import json
import time
from backend.config import CONFIG, save_config

class WeatherService:
    def __init__(self):
        self.cached_weather = None
        self.last_weather_fetch = 0
        self.weather_cache_ttl = 600 # 10 minutes

        self.cached_radar = None
        self.last_radar_fetch = 0
        self.radar_cache_ttl = 300 # 5 minutes

        # Run automatic IP geolocation detection if enabled
        if CONFIG.get("location", {}).get("auto_detect", True):
            self.auto_detect_location()

    def auto_detect_location(self):
        """
        Discovers geographic location via IP geolocation service.
        Sets city, state/region, latitude, and longitude automatically.
        """
        endpoints = [
            "http://ip-api.com/json",
            "https://ipapi.co/json/"
        ]
        for url in endpoints:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "OmniHub-Display/1.0"})
                with urllib.request.urlopen(req, timeout=5) as res:
                    if res.status == 200:
                        data = json.loads(res.read().decode("utf-8"))
                        city = data.get("city")
                        region = data.get("regionName") or data.get("region") or data.get("region_code")
                        lat = data.get("lat") or data.get("latitude")
                        lon = data.get("lon") or data.get("longitude")

                        if city and lat and lon:
                            print(f"[WeatherService] Automatically detected location: {city}, {region} ({lat}, {lon})")
                            CONFIG["location"]["city"] = city
                            CONFIG["location"]["state"] = region or ""
                            CONFIG["location"]["latitude"] = float(lat)
                            CONFIG["location"]["longitude"] = float(lon)
                            save_config(CONFIG)
                            return True
            except Exception as e:
                pass
        return False

    def set_location(self, city, state, lat, lon):
        """Updates location manually or from browser GPS coordinates."""
        CONFIG["location"]["city"] = str(city)
        CONFIG["location"]["state"] = str(state)
        CONFIG["location"]["latitude"] = float(lat)
        CONFIG["location"]["longitude"] = float(lon)
        save_config(CONFIG)
        self.cached_weather = None # Invalidate cache to force immediate refresh
        return CONFIG["location"]

    def reverse_geocode(self, lat, lon):
        """Resolves city and state from latitude and longitude using Open-Meteo geocoding."""
        try:
            url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}"
            req = urllib.request.Request(url, headers={"User-Agent": "OmniHub/1.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    addr = data.get("address", {})
                    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or "Local"
                    state = addr.get("state") or addr.get("country") or ""
                    return self.set_location(city, state, lat, lon)
        except Exception:
            pass
        return self.set_location("Current Location", "", lat, lon)

    def get_weather(self):
        now = time.time()
        if self.cached_weather and (now - self.last_weather_fetch < self.weather_cache_ttl):
            return self.cached_weather

        lat = CONFIG["location"]["latitude"]
        lon = CONFIG["location"]["longitude"]
        
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&"
            f"hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code&"
            f"daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&"
            f"temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timeformat=unixtime&timezone=auto"
        )

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "OmniHub/1.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    data["location"] = CONFIG["location"]
                    self.cached_weather = data
                    self.last_weather_fetch = now
                    return data
        except Exception as e:
            print(f"[WeatherService] Open-Meteo fetch error: {e}")
            if self.cached_weather:
                return self.cached_weather
            # Fallback mock for zero-connectivity situations
            return self._get_fallback_weather()

    def get_radar_frames(self):
        now = time.time()
        if self.cached_radar and (now - self.last_radar_fetch < self.radar_cache_ttl):
            return self.cached_radar

        url = "https://api.rainviewer.com/public/weather-maps.json"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "OmniHub/1.0"})
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode("utf-8"))
                    data["location"] = CONFIG["location"]
                    self.cached_radar = data
                    self.last_radar_fetch = now
                    return data
        except Exception as e:
            print(f"[WeatherService] RainViewer fetch error: {e}")
            if self.cached_radar:
                return self.cached_radar
            return {
                "host": "https://tilecache.rainviewer.com",
                "radar": {"past": [], "nowcast": []},
                "location": CONFIG["location"]
            }

    def _get_fallback_weather(self):
        return {
            "current": {
                "temperature_2m": 68.0,
                "apparent_temperature": 67.2,
                "relative_humidity_2m": 65,
                "precipitation": 0.05,
                "weather_code": 61,
                "wind_speed_10m": 7.2,
                "wind_direction_10m": 45,
                "surface_pressure": 1018.4
            },
            "location": CONFIG["location"]
        }

weather_service = WeatherService()
