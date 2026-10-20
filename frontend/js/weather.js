// OmniHub Weather & Dynamic Geolocation Controller

async function initWeather() {
  // 1. Try browser-level geolocation first for high accuracy
  detectBrowserLocation();

  // 2. Fetch weather and radar loops
  fetchWeatherData();
  fetchRadarFrames();
  setInterval(fetchWeatherData, 300000); // 5 min
  setInterval(fetchRadarFrames, 300000);
}

function detectBrowserLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          console.log(`[Location] Browser GPS detected: ${lat}, ${lon}`);
          const res = await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lon })
          });
          if (res.ok) {
            fetchWeatherData();
          }
        } catch (e) {
          console.log("[Location] Error posting GPS coordinates:", e);
        }
      },
      (err) => {
        console.log("[Location] Browser geolocation unavailable, using IP geolocation:", err.message);
      },
      { timeout: 7000, maximumAge: 600000 }
    );
  }
}

async function fetchWeatherData() {
  try {
    const res = await fetch('/api/weather');
    if (res.ok) {
      const data = await res.json();
      updateWeatherDisplay(data);
    }
  } catch (e) {
    console.log("[Weather] Using local telemetry fallback");
  }
}

async function fetchRadarFrames() {
  try {
    const res = await fetch('/api/radar');
    if (res.ok) {
      const data = await res.json();
      console.log("[Radar] RainViewer frames loaded", data.host);
    }
  } catch (e) {}
}

function updateWeatherDisplay(data) {
  if (!data || !data.current) return;
  const current = data.current;
  const tempF = Math.round(current.temperature_2m || 68);
  const feelsLike = Math.round(current.apparent_temperature || tempF);
  const humidity = Math.round(current.relative_humidity_2m || 65);
  const windMph = Math.round(current.wind_speed_10m || 7);

  // Dynamic Location Resolution
  const loc = data.location || {};
  const city = loc.city || "Local";
  const state = loc.state || "";
  const locationLabel = state ? `${city}, ${state}` : city;

  // Update Main Dashboard Weather Capsule
  const mainTemp = document.getElementById('main-weather-temp');
  const mainDesc = document.getElementById('main-weather-desc');
  const mainHum = document.getElementById('main-weather-humidity');
  const mainWind = document.getElementById('main-weather-wind');

  if (mainTemp) mainTemp.innerHTML = `${tempF}°<span class="text-2xl text-stone-400 font-normal">F</span>`;
  if (mainDesc) mainDesc.textContent = `Feels like ${feelsLike}°`;
  if (mainHum) mainHum.textContent = `${humidity}%`;
  if (mainWind) mainWind.textContent = `${windMph} mph NE`;

  // Update Location Headers
  const dateLocationEl = document.getElementById('main-date-location');
  if (dateLocationEl) {
    const today = new Date();
    const dayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    dateLocationEl.textContent = `${dayStr} • ${city} Metro`;
  }

  const radarPill = document.getElementById('radar-station-pill');
  if (radarPill) {
    radarPill.textContent = `NEXRAD LIVE RADAR • ${city.toUpperCase()} METRO`;
  }

  // Update Immich Screensaver Weather Label
  const immichWeatherTemp = document.getElementById('immich-weather-temp');
  if (immichWeatherTemp) {
    immichWeatherTemp.textContent = `${city}: ${tempF}°F`;
  }
}
