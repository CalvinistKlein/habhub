// OmniHub Weather & Forecast Controller

window.currentWeatherData = null;

async function initWeather() {
  detectBrowserLocation();
  fetchWeatherData();
  fetchWeatherGrid();

  setInterval(fetchWeatherData, 300000); // 5 mins
  setInterval(fetchWeatherGrid, 300000);
}

function detectBrowserLocation() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const res = await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lon })
          });
          if (res.ok) {
            fetchWeatherData();
            fetchWeatherGrid();
          }
        } catch (e) {}
      },
      (err) => {},
      { timeout: 7000, maximumAge: 600000 }
    );
  }
}

async function fetchWeatherData() {
  try {
    const res = await fetch('/api/weather');
    if (res.ok) {
      const data = await res.json();
      window.currentWeatherData = data;
      renderWeather(data);

      // Inform living map
      if (data.location && window.LivingMap) {
        window.LivingMap.setLocation(
          data.location.latitude,
          data.location.longitude,
          data.location.city || "Local Area"
        );
      }
    }
  } catch (e) {
    console.log("[Weather] Fetch error:", e);
  }
}

async function fetchWeatherGrid() {
  try {
    const res = await fetch('/api/weather/field');
    if (res.ok) {
      const field = await res.json();
      document.dispatchEvent(new CustomEvent('livingmap:field', { detail: field }));
    }
  } catch (e) {}
}

function renderWeather(data) {
  if (!data || !data.current) return;
  const cur = data.current;
  const temp = Math.round(cur.temperature_2m);
  const feels = Math.round(cur.apparent_temperature || temp);
  const code = cur.weather_code ?? 0;
  const isDay = cur.is_day ?? 1;

  const desc = window.OHIcons ? window.OHIcons.describe(code, isDay) : { label: 'Clear', icon: '' };

  // 1. Consolidated Weather Card on Dashboard
  const tempEl = document.getElementById('wc-temp');
  const condEl = document.getElementById('wc-cond');
  const iconEl = document.getElementById('wc-icon');
  const metaEl = document.getElementById('wc-meta');

  if (tempEl) tempEl.innerHTML = `${temp}&deg;`;
  if (condEl) condEl.textContent = desc.label;
  if (iconEl && desc.icon) iconEl.innerHTML = desc.icon;

  const humidity = Math.round(cur.relative_humidity_2m || 50);
  const windMph = Math.round(cur.wind_speed_10m || 5);
  const loc = data.location || {};
  const city = loc.city || "Local";
  const state = loc.state || "";
  const placeStr = state ? `${city}, ${state}` : city;

  if (metaEl) {
    metaEl.textContent = `Feels like ${feels}° · Humidity ${humidity}% · Wind ${windMph} mph`;
  }

  // 2. Next 4 Hours Forecast in Weather Card
  const hoursContainer = document.getElementById('wc-hours');
  if (hoursContainer && data.hourly && data.hourly.time) {
    hoursContainer.innerHTML = '';
    const nowSec = Math.floor(Date.now() / 1000);
    let startIndex = 0;

    for (let i = 0; i < data.hourly.time.length; i++) {
      if (data.hourly.time[i] >= nowSec) {
        startIndex = i;
        break;
      }
    }

    const nextHours = [startIndex + 1, startIndex + 2, startIndex + 3, startIndex + 4];
    nextHours.forEach((idx) => {
      if (!data.hourly.time[idx]) return;
      const t = new Date(data.hourly.time[idx] * 1000);
      let hourStr = t.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      const hTemp = Math.round(data.hourly.temperature_2m[idx]);
      const hCode = data.hourly.weather_code[idx] ?? 0;
      const hIsDay = data.hourly.is_day ? data.hourly.is_day[idx] : 1;
      const hDesc = window.OHIcons ? window.OHIcons.describe(hCode, hIsDay) : { icon: '' };
      const hPop = data.hourly.precipitation_probability ? data.hourly.precipitation_probability[idx] : 0;

      const col = document.createElement('div');
      col.className = 'wc-hour';
      col.innerHTML = `
        <div class="h">${hourStr}</div>
        ${hDesc.icon || ''}
        <div class="t">${hTemp}&deg;</div>
        <div class="p">${hPop > 15 ? hPop + '%' : ''}</div>
      `;
      hoursContainer.appendChild(col);
    });
  }

  // 3. Update Screensaver Weather Line
  const ssWeatherLine = document.getElementById('ss-weather-line');
  if (ssWeatherLine) {
    const today = new Date();
    const dayStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    ssWeatherLine.textContent = `${dayStr} · ${placeStr} · ${temp}°F ${desc.label}`;
  }

  // 4. Inbound Storm Alert Capsule (Time-to-Impact Math)
  const stormAlert = document.getElementById('storm-alert');
  const stormText = document.getElementById('storm-alert-text');
  if (stormAlert && stormText) {
    const isRainingNow = (cur.precipitation && cur.precipitation > 0.01) || [51,53,55,61,63,65,80,81,82,95].includes(code);
    if (isRainingNow) {
      stormAlert.classList.remove('hidden');
      stormText.textContent = `Precipitation active over display · Wind ${windMph} mph`;
    } else if (data.hourly && data.hourly.precipitation_probability) {
      // Find first upcoming hour with >40% chance of rain
      let foundRain = false;
      const nowSec = Math.floor(Date.now() / 1000);
      for (let i = 0; i < data.hourly.time.length && i < 8; i++) {
        if (data.hourly.time[i] > nowSec && data.hourly.precipitation_probability[i] >= 40) {
          const diffMins = Math.round((data.hourly.time[i] - nowSec) / 60);
          stormAlert.classList.remove('hidden');
          stormText.textContent = `Inbound precipitation · ~${diffMins}m to impact · Wind ${windMph} mph`;
          foundRain = true;
          break;
        }
      }
      if (!foundRain) {
        stormAlert.classList.add('hidden');
      }
    } else {
      stormAlert.classList.add('hidden');
    }
  }
}
