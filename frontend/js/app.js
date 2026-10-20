// OmniHub Master Application Orchestrator

document.addEventListener('DOMContentLoaded', () => {
  console.log("=== OmniHub Smart Display Initializing ===");
  if (typeof initDock === 'function') initDock();
  if (typeof initScreensaver === 'function') initScreensaver();
  if (typeof initWeather === 'function') initWeather();
  if (typeof initMedia === 'function') initMedia();

  // Automatic Smooth Kiosk Refresh when Git Update Occurs
  startUpdateWatcher();

  // Automatic Fullscreen Trigger
  initAutoFullscreen();
});

function initAutoFullscreen() {
  function requestFS() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Modern browsers may block programmatic fullscreen until first tap/click
      });
    }
  }

  // Attempt immediately on DOM ready
  requestFS();

  // Also bind to first touch or click to satisfy browser user-gesture requirements
  document.addEventListener('click', requestFS, { once: true });
  document.addEventListener('touchstart', requestFS, { once: true });
}

function startUpdateWatcher() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/system/reload_check');
      if (res.ok) {
        const data = await res.json();
        if (data.reload) {
          console.log("[OmniHub] Incoming system update detected. Refreshing kiosk display...");
          window.location.reload();
        }
      }
    } catch (e) {
      // Backend momentarily restarting during update
    }
  }, 4000);
}
