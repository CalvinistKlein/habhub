// OmniHub Living Map
// Satellite imagery centred on the display's location (100-mile radius), lit by the
// real sun position: daylight, golden hour, twilight and night are computed per
// pixel-region from solar elevation, so the terminator sweeps across the map at
// dawn and dusk. NASA Black Marble city lights fade in after dark.
(function () {
  const SAT_URL = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const NIGHT_URL = (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`;
  const NIGHT_MAX_Z = 8;
  const RAD = Math.PI / 180;

  // ------------------------------------------------------------------ solar math
  function solarBase(date) {
    const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
    const g = (357.529 + 0.98560028 * d) * RAD;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * d) * RAD;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    return { ra, dec, gmst };
  }

  function sunAt(base, lat, lon) {
    const H = ((base.gmst * 15 + lon - base.ra) % 360) * RAD;
    const phi = lat * RAD;
    const sinEl = Math.sin(phi) * Math.sin(base.dec) + Math.cos(phi) * Math.cos(base.dec) * Math.cos(H);
    const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
    let az = Math.atan2(-Math.sin(H), Math.cos(phi) * Math.tan(base.dec) - Math.sin(phi) * Math.cos(H));
    if (az < 0) az += 2 * Math.PI;
    return { elevation: el / RAD, azimuth: az / RAD };
  }

  // Elevation (deg) -> multiply colour. White = untouched daylight.
  const RAMP = [
    [-18, [14, 15, 22]],
    [-10, [20, 21, 30]],
    [-5, [52, 46, 62]],
    [-1.5, [128, 92, 96]],
    [1, [228, 156, 112]],
    [4, [250, 204, 160]],
    [9, [255, 236, 214]],
    [16, [255, 255, 255]],
  ];
  function lightColor(el) {
    if (el <= RAMP[0][0]) return RAMP[0][1];
    for (let i = 1; i < RAMP.length; i++) {
      if (el <= RAMP[i][0]) {
        const [e0, c0] = RAMP[i - 1], [e1, c1] = RAMP[i];
        const t = (el - e0) / (e1 - e0);
        return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * t));
      }
    }
    return RAMP[RAMP.length - 1][1];
  }

  // ------------------------------------------------------------------ mercator
  const TILE = 256;
  function project(lat, lon, z) {
    const s = TILE * Math.pow(2, z);
    const siny = Math.min(Math.max(Math.sin(lat * RAD), -0.9999), 0.9999);
    return { x: (lon + 180) / 360 * s, y: (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)) * s };
  }
  function unproject(x, y, z) {
    const s = TILE * Math.pow(2, z);
    const lon = x / s * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / s))) / RAD;
    return { lat, lon };
  }

  const LivingMap = {
    lat: null, lon: null, z: 9, scale: 1, center: null, W: 0, H: 0,
    light: { elevation: 45, azimuth: 180, color: [255, 255, 255], darkness: 0, daylight: 1 },
    radiusMiles: 100,

    init(opts) {
      this.radiusMiles = (opts && opts.radiusMiles) || 100;
      this.sat = document.getElementById('sat-tiles');
      this.night = document.getElementById('night-tiles');
      this.lightCanvas = document.getElementById('light-canvas');
      this.sheen = document.getElementById('sun-sheen');
      this.marker = document.getElementById('you-marker');
      window.addEventListener('resize', () => this.lat !== null && this.layout());
      setInterval(() => this.updateLighting(), 60 * 1000);
    },

    setLocation(lat, lon, label) {
      const moved = this.lat === null || Math.abs(lat - this.lat) > 0.01 || Math.abs(lon - this.lon) > 0.01;
      this.lat = lat; this.lon = lon;
      if (label) document.getElementById('marker-label').textContent = label;
      if (moved) this.layout();
    },

    layout() {
      this.W = window.innerWidth; this.H = window.innerHeight;
      // 100-mile radius fits the shorter screen dimension
      const mppWanted = (this.radiusMiles * 2 * 1609.34) / Math.min(this.W, this.H);
      const cosLat = Math.cos(this.lat * RAD);
      this.z = Math.max(3, Math.min(15, Math.ceil(Math.log2(156543.03392 * cosLat / mppWanted))));
      this.scale = (156543.03392 * cosLat / Math.pow(2, this.z)) / mppWanted; // <= 1, keeps tiles crisp
      this.center = project(this.lat, this.lon, this.z);

      this.placeTiles(this.sat, SAT_URL, this.z);
      this.placeTiles(this.night, NIGHT_URL, Math.min(this.z, NIGHT_MAX_Z));

      this.marker.style.left = this.W / 2 + 'px';
      this.marker.style.top = this.H / 2 + 'px';
      this.updateLighting();
      document.dispatchEvent(new CustomEvent('livingmap:layout'));
    },

    placeTiles(container, urlFn, zt) {
      container.innerHTML = '';
      const f = Math.pow(2, this.z - zt);
      const s = this.scale * f;
      const c = project(this.lat, this.lon, zt);
      const n = Math.pow(2, zt);
      const x0 = Math.floor((c.x - this.W / 2 / s) / TILE), x1 = Math.floor((c.x + this.W / 2 / s) / TILE);
      const y0 = Math.max(0, Math.floor((c.y - this.H / 2 / s) / TILE)), y1 = Math.min(n - 1, Math.floor((c.y + this.H / 2 / s) / TILE));
      const size = TILE * s;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const img = new Image();
          img.decoding = 'async';
          img.style.left = Math.floor((tx * TILE - c.x) * s + this.W / 2) + 'px';
          img.style.top = Math.floor((ty * TILE - c.y) * s + this.H / 2) + 'px';
          img.style.width = img.style.height = Math.ceil(size) + 1 + 'px';
          img.onerror = () => { img.style.visibility = 'hidden'; };
          img.src = urlFn(zt, ((tx % n) + n) % n, ty);
          container.appendChild(img);
        }
      }
    },

    // Screen (CSS px) <-> geographic coordinates
    toScreen(lat, lon) {
      const p = project(lat, lon, this.z);
      return { x: (p.x - this.center.x) * this.scale + this.W / 2, y: (p.y - this.center.y) * this.scale + this.H / 2 };
    },
    toLatLon(x, y) {
      return unproject(this.center.x + (x - this.W / 2) / this.scale, this.center.y + (y - this.H / 2) / this.scale, this.z);
    },

    updateLighting(dateOverride) {
      if (this.lat === null) return;
      const date = dateOverride || new Date();
      const base = solarBase(date);

      // Per-region sun elevation, drawn small and stretched smoothly over the map
      const gw = 48, gh = Math.max(8, Math.round(48 * this.H / this.W));
      const cv = this.lightCanvas;
      if (cv.width !== gw) { cv.width = gw; cv.height = gh; }
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(gw, gh);
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const ll = this.toLatLon((i + 0.5) / gw * this.W, (j + 0.5) / gh * this.H);
          const col = lightColor(sunAt(base, ll.lat, ll.lon).elevation);
          const k = (j * gw + i) * 4;
          img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      const sun = sunAt(base, this.lat, this.lon);
      const el = sun.elevation;
      const darkness = Math.max(0, Math.min(1, (2 - el) / 12));      // 0 day -> 1 night
      const daylight = Math.max(0, Math.min(1, el / 12));
      this.light = { elevation: el, azimuth: sun.azimuth, color: lightColor(el), darkness, daylight };

      // City lights
      this.night.style.opacity = (Math.max(0, Math.min(1, (-el - 1) / 9)) * 0.95).toFixed(3);

      // Directional sheen from the sun's compass bearing
      if (el > -3) {
        const a = sun.azimuth * RAD;
        const x = 50 + Math.sin(a) * 70, y = 45 - Math.cos(a) * 70;
        const warm = Math.max(0, 1 - Math.abs(el - 4) / 14);
        const r = Math.round(255), g = Math.round(244 - 70 * warm), b = Math.round(225 - 120 * warm);
        const alpha = (0.10 + 0.22 * warm) * Math.min(1, (el + 3) / 6);
        this.sheen.style.background = `radial-gradient(ellipse 85% 85% at ${x}% ${y}%, rgba(${r},${g},${b},${alpha.toFixed(3)}), transparent 70%)`;
      } else {
        this.sheen.style.background = 'none';
      }
      document.dispatchEvent(new CustomEvent('livingmap:light', { detail: this.light }));
    },
  };

  window.LivingMap = LivingMap;
  window.OHSun = { solarBase, sunAt };
})();
