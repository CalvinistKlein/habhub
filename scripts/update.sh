#!/usr/bin/env bash
# ==============================================================================
# OmniHub - Automated Safe Git Updater & Database Migration Engine
# ==============================================================================
# Usage:
#   ./scripts/update.sh             # Perform full safe update if new commit exists
#   ./scripts/update.sh --force     # Force update, migrations, and restart
#   ./scripts/update.sh --check     # Only check if updates are available
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BRANCH="${OMNIHUB_BRANCH:-main}"
PORT="${OMNIHUB_PORT:-8765}"
DATA_DIR="${PROJECT_ROOT}/data"
CONFIG_FILE="${DATA_DIR}/config.json"
BACKUP_DIR="${DATA_DIR}/backups"

mkdir -p "$BACKUP_DIR"

log() {
    echo "[OmniHub Updater $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# 1. Verify Git Repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    log "Error: ${PROJECT_ROOT} is not a git repository."
    exit 1
fi

LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "INITIAL")

# 2. Check Remote Repository
REMOTE_URL=$(git config --get remote.origin.url || true)
if [ -z "$REMOTE_URL" ]; then
    log "Notice: No remote.origin.url configured. Set remote via: git remote add origin <github-url>"
    if [ "$1" == "--check" ]; then
        exit 1
    fi
fi

# Fetch remote refs cleanly
REMOTE_COMMIT=""
if [ -n "$REMOTE_URL" ]; then
    REMOTE_COMMIT=$(git ls-remote origin "refs/heads/${BRANCH}" 2>/dev/null | awk '{print $1}')
fi

if [ "$1" == "--check" ]; then
    if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
        log "Update available: Current ($LOCAL_COMMIT) -> Remote ($REMOTE_COMMIT)"
        exit 0
    else
        log "System is up-to-date at commit ${LOCAL_COMMIT:0:8}."
        exit 1
    fi
fi

# Determine if update is required
FORCE_UPDATE=0
if [ "$1" == "--force" ] || [ "$1" == "-f" ]; then
    FORCE_UPDATE=1
fi

if [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" == "$REMOTE_COMMIT" ] && [ $FORCE_UPDATE -eq 0 ]; then
    log "System is already running the latest commit (${LOCAL_COMMIT:0:8}). No update needed."
    exit 0
fi

log "====================================================="
log "  Initiating Safe Update Workflow"
log "  Current Commit: ${LOCAL_COMMIT:0:8}"
log "  Target Commit:  ${REMOTE_COMMIT:0:8:-latest}"
log "====================================================="

# 3. SAFETY STEP: Online Database & Config Snapshot
log "[Safety] Creating online database snapshot..."
LATEST_BACKUP=""
if [ -f "${DATA_DIR}/omnihub.db" ]; then
    LATEST_BACKUP=$(python3 "${PROJECT_ROOT}/backend/database.py" --backup "pre_update" | grep "Backup complete" | awk '{print $NF}')
    log "[Safety] Database snapshot saved: ${LATEST_BACKUP}"
fi

if [ -f "$CONFIG_FILE" ]; then
    cp "$CONFIG_FILE" "${BACKUP_DIR}/config_pre_update_$(date +%Y%m%d_%H%M%S).json"
fi

# 4. Pull Latest Code via Hard Reset (Preserves untracked data/ directory)
log "[Git] Fetching latest changes from origin/${BRANCH}..."
ROLLBACK_NEEDED=0

if [ -n "$REMOTE_URL" ]; then
    if ! git fetch origin "$BRANCH" --quiet; then
        log "Warning: Failed to fetch from origin. Checking if local fast-forward possible..."
    else
        log "[Git] Aligning working tree to origin/${BRANCH}..."
        git reset --hard "origin/${BRANCH}"
    fi
fi

NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "UNKNOWN")
log "[Git] Now at commit: ${NEW_COMMIT:0:8}"

# 5. Database Schema Migrations
log "[Database] Running database schema migrations..."
if ! python3 "${PROJECT_ROOT}/backend/database.py" --migrate; then
    log "Error: Database migration failed! Triggering rollback..."
    ROLLBACK_NEEDED=1
fi

# 6. Service Reload & Health Check
if [ $ROLLBACK_NEEDED -eq 0 ]; then
    log "[Service] Reloading OmniHub service..."
    if command -v systemctl > /dev/null 2>&1 && systemctl --user is-active --quiet omnihub.service 2>/dev/null; then
        systemctl --user restart omnihub.service
        log "[Service] systemd omnihub.service restarted."
    else
        log "[Service] Systemd service not active; sending reload signal if running..."
        # If running via backend/app.py, reload frontend or ping
        curl -s -X POST "http://127.0.0.1:${PORT}/api/system/reload" > /dev/null 2>&1 || true
    fi

    # 7. Verification Health Check
    log "[Health] Verifying API status on port ${PORT}..."
    HEALTHY=0
    for i in {1..12}; do
        sleep 0.5
        if curl -s "http://127.0.0.1:${PORT}/api/status" | grep -q '"status": "online"'; then
            HEALTHY=1
            break
        fi
    done

    if [ $HEALTHY -eq 1 ]; then
        log "Health check passed. OmniHub is online and operational."
        # Refresh the active Chromium kiosk if running
        if command -v xdotool > /dev/null 2>&1 && [ -n "$DISPLAY" ]; then
            xdotool search --onlyvisible --class "chromium" key F5 2>/dev/null || true
        fi
        log "Update successfully completed to ${NEW_COMMIT:0:8}."
        exit 0
    else
        log "Health check FAILED! Backend did not return status 'online'."
        ROLLBACK_NEEDED=1
    fi
fi

# 8. AUTOMATIC ROLLBACK IF UPDATE OR HEALTH CHECK FAILED
if [ $ROLLBACK_NEEDED -eq 1 ]; then
    log "====================================================="
    log "  CRITICAL: Update failed. Rolling back to ${LOCAL_COMMIT:0:8}..."
    log "====================================================="
    if [ "$LOCAL_COMMIT" != "INITIAL" ]; then
        git reset --hard "$LOCAL_COMMIT"
    fi

    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
        log "[Rollback] Restoring database snapshot from ${LATEST_BACKUP}..."
        cp "$LATEST_BACKUP" "${DATA_DIR}/omnihub.db"
    fi

    if command -v systemctl > /dev/null 2>&1 && systemctl --user is-active --quiet omnihub.service 2>/dev/null; then
        systemctl --user restart omnihub.service
    fi
    log "[Rollback] Rollback completed. System restored to previous working state."
    exit 1
fi
