#!/usr/bin/env bash
# ==============================================================================
# OmniHub - Microsoft Surface Go 2 System Setup & Dependencies
# ==============================================================================

set -e

echo "=== Setting up Surface Go 2 Smart Display Environment ==="

# 1. Audio Setup & Permissions
echo "[Setup] Checking audio devices (Surface dual-mic array + stereo speakers)..."
if command -v arecord > /dev/null 2>&1; then
    arecord -l || true
fi
if command -v aplay > /dev/null 2>&1; then
    aplay -l || true
fi

# 2. Piper TTS Setup
echo "[Setup] Checking Piper TTS..."
if ! command -v piper > /dev/null 2>&1; then
    echo "[Setup] Piper TTS not detected in PATH."
    echo "To install Piper standalone binary:"
    echo "  wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_linux_x86_64.tar.gz"
    echo "  tar -xzf piper_linux_x86_64.tar.gz -C /usr/local/bin/"
    echo "  mkdir -p ~/.local/share/piper-voices"
    echo "  wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx -P ~/.local/share/piper-voices/"
    echo "  wget https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json -P ~/.local/share/piper-voices/"
else
    echo "[Setup] Piper TTS is available at $(which piper)"
fi

# 3. Spotify Connect (librespot daemon)
echo "[Setup] Checking librespot..."
if ! command -v librespot > /dev/null 2>&1; then
    echo "[Setup] librespot not found. You can install it via cargo or pre-built binary:"
    echo "  curl -sL https://github.com/librespot-org/librespot/releases/latest/download/librespot-linux-x86_64.tar.gz | tar -xz -C /usr/local/bin/"
else
    echo "[Setup] librespot is available at $(which librespot)"
fi

# 4. OpenWakeWord Local SLM
echo "[Setup] openWakeWord check for 'Hey Hermes' / 'Hey Jarvis'..."
echo "To run wake word listener daemon:"
echo "  pip install openwakeword"

echo "=== Surface Go 2 environment checklist complete ==="
