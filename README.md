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
   - Quick action capsules for 6:30 AM briefing alarm, 5-minute kitchen timer with Web Audio chime, living room light control with Home Assistant sync, and Hermes conversational agent.

3. **Interactive Living Reef Aquarium & Immich Photo Frame**
   - **Living Reef Aquarium**: Autonomous marine ecosystem featuring Clownfish ("Nemo", "Marlin"), Blue Tang ("Dory"), Yellow Tang ("Bubbles"), Angelfish, and schooling Neon Tetras.
   - **Fish Lives & Behaviors**: Realistic hunger dynamics, boid flocking, startle reactions, curiosity around air bubbles, and autonomous foraging.
   - **Interactive Tap-to-Feed**: Tap anywhere on the water to disperse sinking food flakes; hungry fish eagerly sprint to catch them, trigger bubble/heart particles, and play soft bubble-pop audio.
   - **Immich Photo Slideshow**: Local & Immich photo ingestion with smooth Ken Burns transitions.
   - **Dynamic Canvas Contrast Engine**: Evaluates background luminance with an offscreen canvas ($L \le 0.30$) to automatically select `tone-light` (bone-white) or `tone-dark` (obsidian black) typography.
   - **Seamless Mode Switcher**: Quick toggle on the screensaver HUD or Settings to switch between Aquarium and Photos.

4. **Integrated Borderless Spotify Connect Hero**
   - Auto-hides when no music is playing.
   - Full vertical height matching the clock and photo metadata.
   - 5-button tactile touch deck: Skip Back (Previous), Skip Back 15s (Seek -15s), Play/Pause, Skip Ahead 15s (Seek +15s), and Skip Next.
   - One-touch toggle to switch screensaver background between the photo and high-res album artwork.

5. **Full-Bleed Morning Alarm & Web Audio Chimes**
   - **Background Scheduler**: Checks active alarms against current time/weekday.
   - **Ringing Modal**: High-contrast animated ringing screen with giant one-tap dismissal designed for sleepy wakeups on the Surface Go 2.
   - **Piper Vocal Briefing**: Vocalizes morning weather and schedule when the alarm sounds.
   - **Web Audio Chimes**: Ascending 3-tone chime for timer expiration and pulsing C-major triangle chime for alarm ringing.

6. **In-UI Settings Console & One-Tap Git Redeploy**
   - Dedicated Settings Modal for Immich API keys, Home Assistant tokens, Hermes LAN endpoints, and Screensaver timeouts.
   - One-tap "Update & Redeploy" dock button with green pulse notification when new GitHub commits are detected. Safe backup, schema migration, and automatic restart.

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
│       ├── alarm_service.py   # Background scheduler for morning alarms & TTS
│       ├── ha_service.py      # Home Assistant REST & virtual state relay
│       ├── immich_service.py  # Immich photo proxy & timeline ingestion
│       ├── media_service.py   # Spotify Connect state & transport controls
│       ├── updater_service.py # GitOps updater, auto-redeploy & DB migrations
│       ├── voice_pipeline.py  # Piper TTS vocal briefings
│       └── weather_service.py # Open-Meteo & RainViewer radar caching
├── frontend/
│   ├── css/
│   │   └── styles.css         # OLED black styles, animations, glassmorphism
│   ├── js/
│   │   ├── app.js             # Master frontend coordinator & audio synthesizer
│   │   ├── aquarium.js        # Living reef fishtank physics, AI & feeding
│   │   ├── livemap.js         # 100-mile living map with Doppler radar loops
│   │   ├── media.js           # Spotify Connect controller & progress bar
│   │   ├── screensaver.js     # Screensaver mode coordinator & contrast engine
│   │   ├── sky.js             # Atmosphere & daylight simulation
│   │   └── weather.js         # Weather station & inbound storm alerts
│   └── index.html             # Kiosk application interface
├── tests/
│   └── test_omnihub.py        # Automated test suite for DB, services, & AI router
├── data/                      # Local SQLite database and log output (GIT IGNORED)
│   ├── omnihub.db             # Active user database
│   ├── config.json            # User credentials & hardware config
│   └── backups/               # Automated pre-update snapshots
└── scripts/
    ├── start.sh               # Kiosk launcher with Chromium flags
    ├── update.sh              # Safe Git pull, database migration & health check
    ├── laptop_deploy.sh       # Laptop helper: Git push + instant Surface update
    ├── setup_surface.sh       # Hardware setup & audio configuration
    └── omnihub.service        # Systemd autostart unit template
```

---

## GitHub Continuous Deployment & Safe Auto-Update

OmniHub includes an automated, crash-proof update system tailored for running headless on your Surface Go 2:

### 1. Linking Your GitHub Repository
On your Surface Go 2, link your GitHub repository remote:
```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
```

### 2. How the Surface Auto-Updates
* **Background Git Watcher**: The Surface Go 2 backend polls your GitHub repository every 2 minutes using lightweight TLS hash checks (`git ls-remote`). It downloads zero git objects unless a new commit is detected.
* **Online SQLite Snapshot**: Before any files are updated, SQLite natively snapshots `omnihub.db` to `data/backups/omnihub_backup_pre_update_<timestamp>.db`.
* **Automatic Schema Migration**: If your update contains database changes, the migration runner applies new table definitions automatically without touching or wiping user rows.
* **Instant Screen Refresh**: When the update finishes, the Surface Go 2 display reloads automatically in place without closing the kiosk browser.
* **Automated Rollback**: If a new commit fails the local health check, the system automatically rolls back the git commit and restores the database backup.

### 3. Updating Instantly from Your Laptop (2-Second Deploy)
When you're actively developing on your laptop, you don't have to wait 2 minutes for the polling timer. Run:
```bash
./scripts/laptop_deploy.sh surface-go.local
```
This pushes your commit to GitHub and immediately pings the Surface over your local network to back up, pull, migrate, and refresh.

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

