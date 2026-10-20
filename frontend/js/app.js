// OmniHub Master Application Orchestrator

document.addEventListener('DOMContentLoaded', () => {
  console.log("=== OmniHub Smart Display Initializing ===");
  if (typeof initDock === 'function') initDock();
  if (typeof initScreensaver === 'function') initScreensaver();
  if (typeof initWeather === 'function') initWeather();
  if (typeof initMedia === 'function') initMedia();

  // Automatic Smooth Kiosk Refresh when Git Update Occurs
  startUpdateWatcher();
});

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
