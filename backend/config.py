import os
import json

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(CONFIG_DIR), "data")
os.makedirs(DATA_DIR, exist_ok=True)

CONFIG_FILE = os.path.join(DATA_DIR, "config.json")

DEFAULT_CONFIG = {
    # System & Server
    "server_host": "0.0.0.0",
    "server_port": 8765,
    "idle_timeout_seconds": 60,
    
    # Location for Weather & Radar
    "location": {
        "auto_detect": True, # Automatically resolve location via IP / Browser GPS
        "city": "Austin",
        "state": "TX",
        "latitude": 30.2672,
        "longitude": -97.7431,
        "radar_station": "AUTO"
    },
    
    # Weather Settings (Open-Meteo & RainViewer)
    "weather": {
        "provider": "open-meteo",
        "radar_provider": "rainviewer",
        "update_interval_minutes": 10
    },

    # Hermes Instance (Tier 2 Primary Smart Agent)
    "hermes": {
        "enabled": True,
        "endpoint": "http://hermes-node.local:8080",
        "websocket_url": "ws://hermes-node.local:8080/ws",
        "api_key": ""
    },

    # Local AI Fallback (Tier 1 Offline Intent Engine)
    "local_ai": {
        "enabled": True,
        "model_name": "Qwen2.5-0.5B-Instruct-GGUF",
        "model_path": os.path.join(DATA_DIR, "models", "qwen2.5-0.5b-instruct-q4_k_m.gguf"),
        "context_size": 2048
    },

    # Voice Subsystem
    "voice": {
        "wake_word": "hey_hermes",
        "piper_voice": "en_US-lessac-medium",
        "tts_playback_device": "default",
        "mic_device": "default"
    },

    # Media & Spotify Connect
    "media": {
        "spotify_connect_enabled": True,
        "default_backdrop_mode": "photo" # "photo" or "album_art"
    },

    # Immich Photo Frame
    "immich": {
        "enabled": False,
        "server_url": "http://immich.local:2283",
        "api_key": "",
        "album_id": ""
    },

    # Home Assistant
    "home_assistant": {
        "enabled": False,
        "base_url": "http://homeassistant.local:8123",
        "access_token": ""
    },

    # Automated Safe Git Updater & Backups
    "updater": {
        "auto_update_enabled": True,
        "poll_interval_seconds": 120, # Checks GitHub remote every 2 minutes
        "branch": "main",
        "health_check_timeout_seconds": 15
    }
}


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                config = DEFAULT_CONFIG.copy()
                config.update(saved)
                return config
        except Exception as e:
            print(f"[Config] Error loading {CONFIG_FILE}: {e}")
    return DEFAULT_CONFIG.copy()

def save_config(config):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        print(f"[Config] Error saving {CONFIG_FILE}: {e}")
        return False

# Global configuration instance
CONFIG = load_config()
