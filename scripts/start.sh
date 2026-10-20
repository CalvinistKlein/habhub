#!/usr/bin/env bash
# ==============================================================================
# OmniHub Smart Display - Surface Go 2 Kiosk Launcher
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PORT="${OMNIHUB_PORT:-8765}"
APP_URL="http://localhost:${PORT}"
LOG_DIR="${PROJECT_ROOT}/data"
LOG_FILE="${LOG_DIR}/omnihub.log"

mkdir -p "$LOG_DIR"

echo "====================================================="
echo "  Starting OmniHub Smart Display on Surface Go 2"
echo "  Project Root: ${PROJECT_ROOT}"
echo "  Target URL:   ${APP_URL}"
echo "====================================================="

# 1. Start Python Backend Daemon if not already running
if ! curl -s "http://127.0.0.1:${PORT}/api/status" > /dev/null 2>&1; then
    echo "[Launcher] Starting OmniHub backend service on port ${PORT}..."
    python3 "${PROJECT_ROOT}/backend/app.py" >> "$LOG_FILE" 2>&1 &
    BACKEND_PID=$!
    echo "[Launcher] Backend PID: ${BACKEND_PID}"

    # Wait for server readiness
    MAX_RETRIES=15
    COUNT=0
    until curl -s "http://127.0.0.1:${PORT}/api/status" > /dev/null 2>&1; do
        sleep 0.5
        COUNT=$((COUNT + 1))
        if [ $COUNT -ge $MAX_RETRIES ]; then
            echo "[Launcher] Error: Backend failed to respond within $((MAX_RETRIES / 2)) seconds."
            exit 1
        fi
    done
    echo "[Launcher] Backend is ready and responding."
else
    echo "[Launcher] OmniHub backend already running on port ${PORT}."
fi

# Cleanup on exit
cleanup() {
    echo "[Launcher] Shutting down OmniHub kiosk..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 2. Prevent Display Sleeping / DPMS on Surface Go 2
if command -v xset > /dev/null 2>&1; then
    xset s off 2>/dev/null || true
    xset -dpms 2>/dev/null || true
    xset s noblank 2>/dev/null || true
fi

# 3. Detect and Launch Kiosk Browser
# Chromium / Chrome flags tailored for 10.5" Surface Go 2 3:2 touchscreen (1920x1280)
KIOSK_FLAGS=(
    "--kiosk"
    "--app=${APP_URL}"
    "--noerrdialogs"
    "--disable-infobars"
    "--check-for-update-interval=31536000"
    "--disable-pinch"
    "--overscroll-history-navigation=0"
    "--enable-features=OverlayScrollbar"
    "--touch-events=enabled"
    "--hide-scrollbars"
    "--disable-session-crashed-bubble"
    "--disable-features=Translate"
    "--autoplay-policy=no-user-gesture-required"
    "--window-size=1920,1280"
    "--window-position=0,0"
)

if command -v chromium-browser > /dev/null 2>&1; then
    echo "[Launcher] Launching Chromium Browser in full kiosk mode..."
    chromium-browser "${KIOSK_FLAGS[@]}"
elif command -v chromium > /dev/null 2>&1; then
    echo "[Launcher] Launching Chromium in full kiosk mode..."
    chromium "${KIOSK_FLAGS[@]}"
elif command -v google-chrome > /dev/null 2>&1; then
    echo "[Launcher] Launching Google Chrome in full kiosk mode..."
    google-chrome "${KIOSK_FLAGS[@]}"
elif command -v firefox > /dev/null 2>&1; then
    echo "[Launcher] Launching Firefox in kiosk mode..."
    firefox --kiosk "${APP_URL}"
else
    echo "[Launcher] No graphical browser found in PATH. Server remains active at ${APP_URL}."
    echo "[Launcher] Keep running in foreground (Ctrl+C to stop)..."
    wait
fi
