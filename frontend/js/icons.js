// OmniHub vector icon set (no emojis anywhere)
(function () {
  const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  const cloud = 'M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 9.6 4.5 4.5 0 0 0 7 18.5z';
  const smallCloud = 'M8.5 19h8.7a3.6 3.6 0 0 0 .5-7.17 5.2 5.2 0 0 0-10 1.4A2.9 2.9 0 0 0 8.5 19z';

  const ICONS = {
    clearDay: `<svg viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>`,
    clearNight: `<svg viewBox="0 0 24 24" ${S}><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/></svg>`,
    partlyDay: `<svg viewBox="0 0 24 24" ${S}><circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.6v1.4M2.6 8.5H4M4.3 4.3l1 1M12.7 4.3l-1 1"/><path d="${smallCloud}"/></svg>`,
    partlyNight: `<svg viewBox="0 0 24 24" ${S}><path d="M12.5 7.2A5 5 0 1 1 6 3.4a4 4 0 0 0 6.5 3.8z"/><path d="${smallCloud}"/></svg>`,
    cloudy: `<svg viewBox="0 0 24 24" ${S}><path d="${cloud}"/></svg>`,
    fog: `<svg viewBox="0 0 24 24" ${S}><path d="M7 13.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 4.6 4.5 4.5 0 0 0 7 13.5z" transform="translate(0 -1)"/><path d="M4 16.5h16M6 19.5h12"/></svg>`,
    drizzle: `<svg viewBox="0 0 24 24" ${S}><path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><path d="M9 18v1M13 18v1M17 18v1"/></svg>`,
    rain: `<svg viewBox="0 0 24 24" ${S}><path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3"/></svg>`,
    snow: `<svg viewBox="0 0 24 24" ${S}><path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><circle cx="8.5" cy="18.5" r=".6" fill="currentColor"/><circle cx="12.5" cy="20" r=".6" fill="currentColor"/><circle cx="16.5" cy="18.5" r=".6" fill="currentColor"/></svg>`,
    storm: `<svg viewBox="0 0 24 24" ${S}><path d="M7 14.5h10.2a4.3 4.3 0 0 0 .6-8.56A6.2 6.2 0 0 0 5.9 5.6 4.5 4.5 0 0 0 7 14.5z"/><path d="M12.8 14.5l-2.3 3.6h3l-2.2 3.4"/></svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 4.5h3.8v15H6.5zm7.2 0h3.8v15h-3.8z"/></svg>`,
  };

  // WMO weather code -> label + icon family
  function describe(code, isDay) {
    const d = isDay !== 0 && isDay !== false;
    const table = {
      0: ['Clear', d ? 'clearDay' : 'clearNight'],
      1: ['Mostly clear', d ? 'clearDay' : 'clearNight'],
      2: ['Partly cloudy', d ? 'partlyDay' : 'partlyNight'],
      3: ['Overcast', 'cloudy'],
      45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
      51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy drizzle', 'drizzle'],
      56: ['Freezing drizzle', 'drizzle'], 57: ['Freezing drizzle', 'drizzle'],
      61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
      66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
      71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
      80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'],
      85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
      95: ['Thunderstorms', 'storm'], 96: ['Thunderstorms, hail', 'storm'], 99: ['Severe thunderstorms', 'storm'],
    };
    const [label, icon] = table[code] || ['Cloudy', 'cloudy'];
    return { label, icon: ICONS[icon], key: icon };
  }

  window.OHIcons = { ...ICONS, describe };
})();
