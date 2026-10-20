# OmniHub Smart Display

A high-performance, local-first smart display platform engineered for the Microsoft Surface Go 2 (10.5", 1920x1280 3:2 touchscreen) running Linux. Designed to replace closed ecosystem devices (Google Nest Hub, Amazon Echo Show) with complete user privacy, local zero-latency control, live Doppler NEXRAD radar, and integration with your home AI (Hermes) and media systems (Spotify Connect, Immich).

---

## Key Features

1. **Top 65% Open NEXRAD Doppler Radar & Satellite Topography**
   - Live precipitation radar sweep over dark satellite terrain with Austin Metro Ka-band radar and dBZ reflectivity scale (10–65+ dBZ).
   - Inbound storm alert capsule with time-to-impact calculations.

2. **Bottom-Anchored Typography & Ergonomic HUD**
   - Giant glanceable clock digits (112px font) with AM/PM indicator and date.
   - Live Open-Meteo weather capsule with temperature, humidity, NE wind vector, and air quality index.
   - Quick action capsules for 6:30 AM briefing alarm, 5-minute kitchen timer, living room light control, and Hermes conversational agent.

3. **Immich Photo Frame Screensaver with Calibrated Contrast**
   - Automatically enters full-bleed Ken Burns photo slideshow when idle.
   - **Calibrated Contrast Engine**: Text dynamically evaluates background luminance against the dark bottom-left pine/twilight region of Yosemite ($L \le 0.30$). If the backdrop is darker than this threshold, text renders bone-white; otherwise, obsidian black.
   - **Distraction-Free**: Watermarks removed, with only a minimalist bottom swipe bar remaining.
   - **Bottom-Anchored Hero Stack**: Clock digits and Spotify Connect player aligned along the bottom edge.

4. **Integrated Borderless Spotify Connect Hero**
   - Auto-hides when no music is playing.
   - Full vertical height matching the clock and photo metadata.
   - 5-button tactile touch deck: Skip Back (Previous), Skip Back 15s (Seek -15s), Play/Pause, Skip Ahead 15s (Seek +15s), and Skip Next.
   - One-touch toggle to switch screensaver background between the photo and high-res album artwork.

5. **Multi-Tier AI & Voice Architecture**
   - **Tier 1 (Local Zero-Latency)**: Instant local matching for alarms, timers, weather, and light toggles.
   - **Tier 2 (LAN Hermes Node)**: Connects to your local Hermes instance at `hermes-node.local:8080` for advanced conversational intelligence.
   - **Local TTS**: High-fidelity vocal synthesis via Piper TTS.

---

## Directory Layout

```
omnihub/
├── backend/
│   ├── app.py                 # Threaded HTTP server & REST API (Python 3 stdlib)
│   ├── config.py              # Configuration manager & JSON persistence
│   ├── database.py            # SQLite database for alarms, timers, preferences
│   └── services/
│       ├── ai_router.py       # Multi-tier AI routing (Local SLM -> Hermes LAN)
│       ├── media_service.py   # Spotify Connect state & transport controls
│       ├── voice_pipeline.py  # Piper TTS vocal briefings
│       └── weather_service.py # Open-Meteo & RainViewer radar caching
├── frontend/
│   ├── css/
│   │   └── styles.css         # OLED black styles, animations, glassmorphism
│   ├── js/
│   │   ├── app.js             # Master frontend coordinator & carousel gestures
│   │   ├── dock.js            # Android Auto bottom dock & status bar
│   │   ├── media.js           # Spotify Connect controller & progress bar
│   │   ├── screensaver.js     # Immich photo frame & automatic contrast engine
│   │   └── weather.js         # Weather station & radar frame updates
│   └── index.html             # Kiosk application interface
├── data/                      # Local SQLite database and log output
└── scripts/
    ├── start.sh               # Kiosk launcher with Chromium flags
    ├── setup_surface.sh       # Hardware setup & audio configuration
    └── omnihub.service        # Systemd autostart unit template
```

---

## Quick Start

### 1. Launch OmniHub Server
```bash
python3 backend/app.py
```
OmniHub runs out-of-the-box using the Python 3 standard library with zero external pip dependencies required for initial operation.

### 2. Start Kiosk Mode on Surface Go 2
```bash
./scripts/start.sh
```
This automatically starts the backend daemon, disables screen blanking / DPMS, and launches Chromium in fullscreen kiosk mode with touchscreen touch events enabled.

### 3. Autostart via Systemd (Optional)
```bash
cp scripts/omnihub.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now omnihub.service
```
