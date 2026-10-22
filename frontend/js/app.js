// OmniHub Master Application Orchestrator
// Android Auto / CarPlay Dynamic Layout Coordinator

document.addEventListener('DOMContentLoaded', () => {
  console.log("=== OmniHub Smart Display Initializing ===");

  // 1. Initialize Subsystems
  if (typeof initScreensaver === 'function') initScreensaver();
  if (typeof initWeather === 'function') initWeather();
  if (typeof initMedia === 'function') initMedia();
  if (window.LivingMap) window.LivingMap.init({ radiusMiles: 100 });
  if (window.Sky) window.Sky.init();

  // 2. Start Live Time Update for Clocks
  startClock();

  // 3. GitHub GitOps Reload Listener
  startUpdateWatcher();

  // 4. Hardware Auto-Fullscreen Trigger
  initAutoFullscreen();
});

// Live Synchronized Clocks
function startClock() {
  function tick() {
    const now = new Date();
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    // Update all clock elements
    document.querySelectorAll('[data-clock]').forEach((el) => {
      const hm = el.querySelector('.hm');
      const ap = el.querySelector('.ampm');
      if (hm) hm.textContent = timeStr;
      if (ap) ap.textContent = ampm;
    });

    const dockClock = document.querySelector('[data-dock-clock]');
    if (dockClock) {
      dockClock.textContent = `${timeStr} ${ampm}`;
    }

    const dateLine = document.querySelector('[data-date-line]');
    if (dateLine) {
      const dayStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      dateLine.textContent = dayStr;
    }
  }

  tick();
  setInterval(tick, 1000);
}

// Android Auto / CarPlay Dynamic Focus Modes
function toggleMapFocus(e) {
  if (e) e.stopPropagation();
  const body = document.body;
  if (body.classList.contains('mode-map')) {
    setDashboardMode('split');
  } else {
    setDashboardMode('map');
  }
}

function setDashboardMode(mode) {
  const body = document.body;
  const btnAuto = document.getElementById('dock-btn-auto');
  const btnMap = document.getElementById('dock-btn-map');

  if (mode === 'map') {
    body.classList.remove('mode-split');
    body.classList.add('mode-map');
    if (btnAuto) btnAuto.classList.remove('active');
    if (btnMap) btnMap.classList.add('active');
  } else {
    body.classList.remove('mode-map');
    body.classList.add('mode-split');
    if (btnAuto) btnAuto.classList.add('active');
    if (btnMap) btnMap.classList.remove('active');
  }

  // Allow layout readjustment
  setTimeout(() => {
    if (window.LivingMap) window.LivingMap.layout();
    if (window.Sky) window.Sky.resize();
  }, 450);
}

// Hardware & Browser Fullscreen Controller
function toggleFullscreen(e) {
  if (e) e.stopPropagation();
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (rfs) {
      rfs.call(el).catch((err) => {
        console.warn("[OmniHub] Fullscreen request rejected:", err);
      });
    }
  } else {
    const efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (efs) {
      efs.call(document).catch(() => {});
    }
  }
}

function updateFullscreenIcon() {
  const enterIcon = document.querySelector('#dock-btn-fullscreen .icon-fs-enter');
  const exitIcon = document.querySelector('#dock-btn-fullscreen .icon-fs-exit');
  if (document.fullscreenElement) {
    if (enterIcon) enterIcon.classList.add('hidden');
    if (exitIcon) exitIcon.classList.remove('hidden');
  } else {
    if (enterIcon) enterIcon.classList.remove('hidden');
    if (exitIcon) exitIcon.classList.add('hidden');
  }
}

document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

// Hardware & Browser Auto-Fullscreen (Uses Capture Phase so stopPropagation doesn't block it)
function initAutoFullscreen() {
  function requestFS() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
      if (rfs) {
        rfs.call(el).catch(() => {});
      }
    }
  }

  // Capture phase ensures user gestures anywhere on the screen trigger fullscreen
  window.addEventListener('click', requestFS, { capture: true, once: true });
  window.addEventListener('touchstart', requestFS, { capture: true, once: true });
  window.addEventListener('pointerdown', requestFS, { capture: true, once: true });

  // Keyboard shortcut: F11 or 'f' to toggle fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
}

// Seamless Background Auto-Refresh upon Git Updates
function startUpdateWatcher() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/system/reload_check');
      if (res.ok) {
        const data = await res.json();
        if (data.reload) {
          console.log("[OmniHub] Git update received. Refreshing display...");
          window.location.reload();
        }
      }
    } catch (e) {}
  }, 3500);

  // Also check if remote update is pending to light up update badge
  setInterval(checkUpdateBadge, 25000);
  checkUpdateBadge();
}

async function checkUpdateBadge() {
  try {
    const res = await fetch('/api/system/version');
    if (res.ok) {
      const data = await res.json();
      const badge = document.getElementById('update-badge');
      if (badge) {
        if (data.update_available) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      }
    }
  } catch (e) {}
}

// =============================================================================
// SYSTEM UPDATE & REDEPLOY MODAL CONTROLLER
// =============================================================================
async function openUpdateModal(e) {
  if (e) e.stopPropagation();
  const modal = document.getElementById('modal-update');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/system/version');
    if (res.ok) {
      const data = await res.json();
      const commitChip = document.getElementById('update-current-commit');
      const statusText = document.getElementById('update-status-text');
      const logText = document.getElementById('update-log-text');
      const btnRedeploy = document.getElementById('btn-redeploy-now');

      const shortCommit = data.current_commit ? data.current_commit.substring(0, 8) : 'unknown';
      if (commitChip) commitChip.textContent = `Branch: ${data.branch} (${shortCommit})`;

      if (data.update_available) {
        const shortRemote = data.remote_commit ? data.remote_commit.substring(0, 8) : 'new';
        if (statusText) statusText.textContent = `Update available: ${shortCommit} → ${shortRemote}`;
        if (btnRedeploy) btnRedeploy.textContent = "Pull Update & Redeploy";
      } else {
        if (statusText) statusText.textContent = `System is up to date at commit ${shortCommit}.`;
        if (btnRedeploy) btnRedeploy.textContent = "Force Update & Redeploy";
      }
      if (logText && data.last_updated_at) {
        const d = new Date(data.last_updated_at * 1000).toLocaleTimeString();
        logText.textContent = `Last update applied at ${d}. Backups: ${data.backups_available}`;
      }
    }
  } catch (err) {}
}

function closeUpdateModal() {
  const modal = document.getElementById('modal-update');
  if (modal) modal.classList.add('hidden');
}

async function checkGitHubUpdate() {
  const spinner = document.getElementById('update-spinner');
  const statusText = document.getElementById('update-status-text');
  const btnCheck = document.getElementById('btn-check-update');
  const btnRedeploy = document.getElementById('btn-redeploy-now');

  if (spinner) spinner.classList.remove('hidden');
  if (statusText) statusText.textContent = "Querying remote GitHub repository...";
  if (btnCheck) btnCheck.disabled = true;

  try {
    const res = await fetch('/api/system/check_update');
    if (res.ok) {
      const data = await res.json();
      const shortLocal = (data.current_commit || '').substring(0, 8);
      const shortRemote = (data.remote_commit || '').substring(0, 8);

      if (data.update_available) {
        if (statusText) statusText.textContent = `New update found (${shortRemote})! Ready to pull and redeploy.`;
        if (btnRedeploy) btnRedeploy.textContent = "Pull Update & Redeploy";
      } else {
        if (statusText) statusText.textContent = `Already up to date at commit ${shortLocal}.`;
      }
      checkUpdateBadge();
    }
  } catch (e) {
    if (statusText) statusText.textContent = "Could not reach update server. Check network connection.";
  } finally {
    if (spinner) spinner.classList.add('hidden');
    if (btnCheck) btnCheck.disabled = false;
  }
}

async function triggerSystemRedeploy() {
  const spinner = document.getElementById('update-spinner');
  const statusText = document.getElementById('update-status-text');
  const logText = document.getElementById('update-log-text');
  const btnRedeploy = document.getElementById('btn-redeploy-now');
  const btnCheck = document.getElementById('btn-check-update');

  if (spinner) spinner.classList.remove('hidden');
  if (btnRedeploy) btnRedeploy.disabled = true;
  if (btnCheck) btnCheck.disabled = true;
  if (statusText) statusText.textContent = "Shutting down, pulling update, and redeploying...";
  if (logText) logText.textContent = "1. Creating safe SQLite database snapshot\n2. Pulling latest code from GitHub\n3. Executing schema migrations\n4. Restarting service...";

  try {
    const res = await fetch('/api/system/update', { method: 'POST' });
    if (res.ok) {
      if (statusText) statusText.textContent = "Update initiated! Restarting service in 3 seconds...";
      // Start polling for server reconnection
      pollForReboot();
    } else {
      if (statusText) statusText.textContent = "Failed to start update workflow.";
      if (spinner) spinner.classList.add('hidden');
      if (btnRedeploy) btnRedeploy.disabled = false;
    }
  } catch (e) {
    // If the server shut down immediately, proceed to poll for reboot
    pollForReboot();
  }
}

function pollForReboot() {
  let attempts = 0;
  const statusText = document.getElementById('update-status-text');
  const timer = setInterval(async () => {
    attempts++;
    if (statusText) statusText.textContent = `Redeploying OmniHub... Reconnecting (${attempts}s)`;
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (res.ok) {
        clearInterval(timer);
        if (statusText) statusText.textContent = "Redeploy complete! Refreshing display...";
        setTimeout(() => window.location.reload(), 500);
      }
    } catch (e) {}
    if (attempts > 30) {
      clearInterval(timer);
      if (statusText) statusText.textContent = "Reconnection timed out. Please refresh the page manually.";
    }
  }, 1000);
}

// =============================================================================
// QUICK ACTION CAPSULES CONTROLLER
// =============================================================================
async function toggleMorningAlarm(e) {
  if (e) e.stopPropagation();
  const pill = document.getElementById('action-alarm-pill');
  const sub = document.getElementById('pill-alarm-sub');
  const isCurrentlyOn = pill ? pill.classList.contains('active') : true;

  try {
    const res = await fetch('/api/alarms/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 1, enabled: !isCurrentlyOn })
    });
    if (res.ok) {
      const data = await res.json();
      const enabled = data.alarm ? data.alarm.enabled === 1 : !isCurrentlyOn;
      if (pill) {
        if (enabled) {
          pill.classList.add('active');
          if (sub) sub.textContent = "Alarm ON";
        } else {
          pill.classList.remove('active');
          if (sub) sub.textContent = "Alarm OFF";
        }
      }
    }
  } catch (err) {}
}

let activeTimerInterval = null;
let timerSecondsRemaining = 0;

async function toggleKitchenTimer(e) {
  if (e) e.stopPropagation();
  const pill = document.getElementById('action-timer-pill');
  const title = document.getElementById('pill-timer-title');
  const sub = document.getElementById('pill-timer-sub');

  if (activeTimerInterval) {
    // Cancel running timer
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
    timerSecondsRemaining = 0;
    if (pill) pill.classList.remove('active');
    if (title) title.textContent = "5 Min";
    if (sub) sub.textContent = "Timer";
    try { fetch('/api/timers/delete', { method: 'POST' }); } catch (err) {}
    return;
  }

  // Start 5 min timer
  timerSecondsRemaining = 300;
  if (pill) pill.classList.add('active');
  try {
    fetch('/api/timers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: 300, label: "Kitchen Timer" })
    });
  } catch (err) {}

  activeTimerInterval = setInterval(() => {
    timerSecondsRemaining--;
    if (timerSecondsRemaining <= 0) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      if (pill) pill.classList.remove('active');
      if (title) title.textContent = "Done!";
      if (sub) sub.textContent = "Timer Expired";
      setTimeout(() => {
        if (title) title.textContent = "5 Min";
        if (sub) sub.textContent = "Timer";
      }, 5000);
    } else {
      const m = Math.floor(timerSecondsRemaining / 60);
      const s = String(timerSecondsRemaining % 60).padStart(2, '0');
      if (title) title.textContent = `${m}:${s}`;
      if (sub) sub.textContent = "Counting Down";
    }
  }, 1000);
}

let lightsState = false;
async function toggleLivingRoomLights(e) {
  if (e) e.stopPropagation();
  lightsState = !lightsState;
  const pill = document.getElementById('action-light-pill');
  const sub = document.getElementById('pill-light-sub');
  if (pill) {
    if (lightsState) {
      pill.classList.add('active');
      if (sub) sub.textContent = "ON · 85%";
    } else {
      pill.classList.remove('active');
      if (sub) sub.textContent = "OFF";
    }
  }
  try {
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: lightsState ? "turn on the lights" : "turn off the lights" })
    });
  } catch (err) {}
}

let recognitionInstance = null;

async function triggerHermesPrompt(e) {
  if (e) e.stopPropagation();
  const pill = document.getElementById('action-hermes-pill');
  const sub = document.getElementById('pill-hermes-sub');
  if (pill) pill.classList.add('active');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition) {
    if (recognitionInstance) {
      try { recognitionInstance.stop(); } catch (err) {}
      recognitionInstance = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionInstance = recognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      if (sub) sub.textContent = "Listening...";

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        if (sub) sub.textContent = `"${transcript}"`;
        await processHermesVoiceQuery(transcript, pill, sub);
      };

      recognition.onerror = async (event) => {
        console.warn("[Hermes Voice] Speech error:", event.error);
        if (sub) sub.textContent = "No voice heard";
        setTimeout(() => resetHermesPill(pill, sub), 2500);
      };

      recognition.onend = () => {
        recognitionInstance = null;
      };

      recognition.start();
      return;
    } catch (err) {
      console.warn("[Hermes Voice] Could not start speech recognition:", err);
    }
  }

  // Fallback if browser SpeechRecognition is unavailable
  if (sub) sub.textContent = "Checking...";
  await processHermesVoiceQuery("What's the weather today?", pill, sub);
}

async function processHermesVoiceQuery(queryText, pill, sub) {
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: queryText })
    });
    if (res.ok) {
      const data = await res.json();
      if (sub) sub.textContent = data.text ? data.text.substring(0, 35) + "..." : "Done.";
      if (data.text) {
        // Send to local Piper TTS
        fetch('/api/voice/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: data.text })
        });
      }
    }
  } catch (err) {
    if (sub) sub.textContent = "Error answering";
  }

  setTimeout(() => resetHermesPill(pill, sub), 4500);
}

function resetHermesPill(pill, sub) {
  if (pill) pill.classList.remove('active');
  if (sub) sub.textContent = "Voice Agent";
}
