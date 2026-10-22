#!/usr/bin/env bash
# ==============================================================================
# OmniHub Smart Display - Surface Go 2 Kiosk Launcher
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PORT="${OMNIHUB_PORT:-8765}"
APP_URL="http://localhost:${PORT}"
DATA_DIR="${PROJECT_ROOT}/data"
LOG_FILE="${DATA_DIR}/omnihub.log"
KIOSK_PROFILE="${DATA_DIR}/kiosk-profile"

mkdir -p "$DATA_DIR"
mkdir -p "$KIOSK_PROFILE"

# Remove any stale lock files from previous unclean shutdowns
rm -f "${KIOSK_PROFILE}/Singleton"* 2>/dev/null || true

echo "====================================================="
echo "  Starting OmniHub Smart Display on Surface Go 2"
echo "  Project Root: ${PROJECT_ROOT}"
echo "  Target URL:   ${APP_URL}"
echo "  Profile Dir:  ${KIOSK_PROFILE}"
echo "====================================================="

# 1. Auto-Detect Graphical Display (Wayland or X11)
UID_NUM=$(id -u)
if [ -z "$DISPLAY" ] && [ -z "$WAYLAND_DISPLAY" ]; then
    echo "[Launcher] DISPLAY not set in current shell. Probing physical sessions..."
    if [ -S "/run/user/${UID_NUM}/wayland-0" ]; then
        export WAYLAND_DISPLAY="wayland-0"
        export XDG_RUNTIME_DIR="/run/user/${UID_NUM}"
        echo "[Launcher] Attached to active Wayland display (wayland-0)."
    elif [ -S "/run/user/${UID_NUM}/wayland-1" ]; then
        export WAYLAND_DISPLAY="wayland-1"
        export XDG_RUNTIME_DIR="/run/user/${UID_NUM}"
        echo "[Launcher] Attached to active Wayland display (wayland-1)."
    elif [ -S "/tmp/.X11-unix/X0" ]; then
        export DISPLAY=":0"
        export XAUTHORITY="${HOME}/.Xauthority"
        echo "[Launcher] Attached to active X11 display (:0)."
    elif [ -S "/tmp/.X11-unix/X1" ]; then
        export DISPLAY=":1"
        export XAUTHORITY="${HOME}/.Xauthority"
        echo "[Launcher] Attached to active X11 display (:1)."
    else
        echo "[Launcher] Warning: No active X11 or Wayland display socket detected."
    fi
fi

# 2. Start Python Backend Daemon if not already running
BACKEND_PID=""
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
BROWSER_PID=""
cleanup() {
    echo "[Launcher] Shutting down OmniHub kiosk..."
    if [ -n "$BROWSER_PID" ]; then
        kill "$BROWSER_PID" 2>/dev/null || true
    fi
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    restore_gnome_panel
}
trap cleanup EXIT INT TERM

# GNOME Shell Panel Management (Ensures complete full-bleed kiosk without top bar)
hide_gnome_panel() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.panel.hide();" 2>/dev/null || \
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.panel.actor.hide();" 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.just-perfection panel false 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.dash-to-dock autohide true 2>/dev/null || true
}

restore_gnome_panel() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.panel.show();" 2>/dev/null || \
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "Main.panel.actor.show();" 2>/dev/null || true
    gsettings set org.gnome.shell.extensions.just-perfection panel true 2>/dev/null || true
}

hide_gnome_panel

# 3. Prevent Display Sleeping / DPMS on Surface Go 2
if [ -n "$DISPLAY" ] && command -v xset > /dev/null 2>&1; then
    xset s off 2>/dev/null || true
    xset -dpms 2>/dev/null || true
    xset s noblank 2>/dev/null || true
fi

# 4. Detect Graphical Browser Binary
BROWSER_BIN=""
if command -v chromium-browser > /dev/null 2>&1; then
    BROWSER_BIN="chromium-browser"
elif command -v chromium > /dev/null 2>&1; then
    BROWSER_BIN="chromium"
elif command -v google-chrome > /dev/null 2>&1; then
    BROWSER_BIN="google-chrome"
elif command -v brave-browser > /dev/null 2>&1; then
    BROWSER_BIN="brave-browser"
elif command -v brave > /dev/null 2>&1; then
    BROWSER_BIN="brave"
elif command -v firefox > /dev/null 2>&1; then
    BROWSER_BIN="firefox"
fi

if [ -z "$BROWSER_BIN" ]; then
    echo "[Launcher] No graphical browser found in PATH. Server remains active at ${APP_URL}."
    echo "[Launcher] Running in foreground (Ctrl+C to stop)..."
    wait
    exit 0
fi

# 5. Dedicated Kiosk Flags
# Clear cached window geometries so browser never restores a windowed state
rm -f "${KIOSK_PROFILE}/Default/Preferences" 2>/dev/null || true

PLATFORM_FLAGS=()
if [ -n "$WAYLAND_DISPLAY" ]; then
    echo "[Launcher] Native Wayland compositor detected (${WAYLAND_DISPLAY}). Enforcing direct Wayland surface..."
    PLATFORM_FLAGS+=(
        "--ozone-platform=wayland"
        "--enable-features=UseOzonePlatform,WaylandWindowDecorations"
    )
elif [ -n "$DISPLAY" ]; then
    echo "[Launcher] X11 display detected (${DISPLAY}). Enforcing X11 mode..."
    PLATFORM_FLAGS+=(
        "--ozone-platform=x11"
    )
else
    PLATFORM_FLAGS+=(
        "--ozone-platform-hint=auto"
    )
fi

KIOSK_FLAGS=(
    "--user-data-dir=${KIOSK_PROFILE}"
    "--kiosk"
    "--start-fullscreen"
    "--start-maximized"
    "--window-position=0,0"
    "--window-size=1920,1280"
    "${PLATFORM_FLAGS[@]}"
    "--no-first-run"
    "--no-default-browser-check"
    "--noerrdialogs"
    "--disable-infobars"
    "--disable-translate"
    "--disable-features=Translate,OptimizationHints,MediaRouter"
    "--disable-session-crashed-bubble"
    "--check-for-update-interval=31536000"
    "--disable-pinch"
    "--overscroll-history-navigation=0"
    "--enable-features=OverlayScrollbar"
    "--touch-events=enabled"
    "--hide-scrollbars"
    "--autoplay-policy=no-user-gesture-required"
    "--password-store=basic"
    "--class=OmniHubKiosk"
)

echo "[Launcher] Launching ${BROWSER_BIN} in isolated kiosk mode..."
if [ "$BROWSER_BIN" == "firefox" ]; then
    firefox --kiosk "${APP_URL}" &
    BROWSER_PID=$!
else
    "$BROWSER_BIN" "${KIOSK_FLAGS[@]}" "${APP_URL}" &
    BROWSER_PID=$!
fi

echo "[Launcher] Kiosk Browser PID: ${BROWSER_PID}"

# 6. Background Fullscreen Helper (Enforces OS Taskbar & GNOME Topbar Hide)
(
    for sec in 1 2 4 6; do
        sleep "$sec"
        hide_gnome_panel
        # Ensure window manager flags window as fullscreen
        if [ -n "$DISPLAY" ] && command -v wmctrl > /dev/null 2>&1; then
            wmctrl -r "OmniHub" -b add,fullscreen 2>/dev/null || true
            wmctrl -r "Chrome" -b add,fullscreen 2>/dev/null || true
            wmctrl -r "Chromium" -b add,fullscreen 2>/dev/null || true
        fi
        if [ -n "$DISPLAY" ] && command -v xdotool > /dev/null 2>&1; then
            for cls in "OmniHubKiosk" "google-chrome" "chromium" "brave-browser" "firefox"; do
                xdotool search --onlyvisible --class "$cls" windowactivate --sync key F11 2>/dev/null || true
            done
        fi
    done
) &

# Keep launcher running while browser is open
wait "$BROWSER_PID"
