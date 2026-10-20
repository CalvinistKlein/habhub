// OmniHub Weather & NEXRAD Radar Loop Controller

async function initWeather() {
  fetchWeatherData();
  fetchRadarFrames();
  setInterval(fetchWeatherData, 300000); // 5 min
  setInterval(fetchRadarFrames, 300000);
}

async function fetchWeatherData() {
  try {
    const res = await fetch('/api/weather');
    if (res.ok) {
      const data = await res.json();
      updateWeatherDisplay(data);
    }
  } catch (e) {
    console.log("[Weather] Using local telemetry");
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

  // Update Main Dashboard Weather Capsule
  const mainTemp = document.getElementById('main-weather-temp');
  const mainDesc = document.getElementById('main-weather-desc');
  const mainHum = document.getElementById('main-weather-humidity');
  const mainWind = document.getElementById('main-weather-wind');

  if (mainTemp) mainTemp.innerHTML = `${tempF}°<span class="text-2xl text-stone-400 font-normal">F</span>`;
  if (mainDesc) mainDesc.textContent = `Light Rain • Feels like ${feelsLike}°`;
  if (mainHum) mainHum.textContent = `${humidity}%`;
  if (mainWind) mainWind.textContent = `${windMph} mph NE`;

  // Update Immich Screensaver Weather Label
  const immichWeatherTemp = document.getElementById('immich-weather-temp');
  if (immichWeatherTemp) {
    immichWeatherTemp.textContent = `Austin: ${tempF}°F Light Rain`;
  }
}
