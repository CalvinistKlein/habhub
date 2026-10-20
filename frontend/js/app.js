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

// Hardware & Browser Auto-Fullscreen
function initAutoFullscreen() {
  function requestFS() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  requestFS();
  window.addEventListener('click', requestFS);
  window.addEventListener('touchstart', requestFS);
  window.addEventListener('pointerdown', requestFS);
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
  }, 4000);
}
