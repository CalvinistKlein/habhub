#!/usr/bin/env bash
# ==============================================================================
# OmniHub - Laptop Instant Deploy Helper
# ==============================================================================
# Run this from your laptop to push your latest changes to GitHub and
# immediately trigger the Surface Go 2 to pull, back up, migrate, and reload!
#
# Usage:
#   ./scripts/laptop_deploy.sh
#   ./scripts/laptop_deploy.sh 192.168.1.125
# ==============================================================================

set -e

SURFACE_HOST="${1:-${SURFACE_HOST:-surface-go.local}}"
SURFACE_PORT="${SURFACE_PORT:-8765}"
BRANCH="${2:-main}"

echo "====================================================="
echo "  OmniHub Instant Laptop Deploy"
echo "  Target Surface: http://${SURFACE_HOST}:${SURFACE_PORT}"
echo "  Branch:         ${BRANCH}"
echo "====================================================="

# 1. Push code to GitHub
echo "[1/2] Pushing commits to GitHub (origin/${BRANCH})..."
git push origin "$BRANCH"

# 2. Trigger Surface Go 2 to update immediately
echo "[2/2] Triggering instant update & backup on Surface Go 2..."
if curl -s -f -X POST "http://${SURFACE_HOST}:${SURFACE_PORT}/api/system/update" -H "Content-Type: application/json" > /dev/null; then
    echo "Success! Surface Go 2 received the update trigger."
    echo "It is backing up the database, applying migrations, and refreshing the screen."
else
    echo "Notice: Could not reach http://${SURFACE_HOST}:${SURFACE_PORT} directly over LAN."
    echo "No problem! The Surface Go 2 background watcher will automatically pull from GitHub within 2 minutes."
fi
