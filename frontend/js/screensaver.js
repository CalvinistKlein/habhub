// OmniHub Idle Screensaver & Dynamic Canvas Contrast Engine
// Calibrated baseline: Samples bottom-left 35% x 30% of image with offscreen canvas
// Relative luminance (0.2126R + 0.7152G + 0.0722B): L <= 0.30 -> White text, L > 0.30 -> Obsidian Black text

const SLIDESHOW_PHOTOS = [
  {
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=85",
    isDark: true // Yosemite
  },
  {
    url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=2560&q=85",
    isDark: false // Alps Snow Summit (Bright)
  },
  {
    url: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=2560&q=85",
    isDark: true // Foggy Forest Valley
  }
];

let photoIndex = 0;
let isAlbumArtBackdrop = false;
let idleTimer = null;
let IDLE_TIMEOUT_MS = 10000; // 10 seconds of inactivity -> back to screensaver
let screensaverMode = 'aquarium'; // 'aquarium' (living reef) or 'photos' (slideshow/immich)

async function initScreensaver() {
  const ss = document.getElementById('screensaver');
  if (!ss) return;

  // Load user settings for default screensaver mode & timeout
  try {
    const sres = await fetch('/api/settings');
    if (sres.ok) {
      const sdata = await sres.json();
      if (sdata.screensaver) {
        if (sdata.screensaver.mode) screensaverMode = sdata.screensaver.mode;
        if (sdata.screensaver.return_after_seconds) {
          IDLE_TIMEOUT_MS = sdata.screensaver.return_after_seconds * 1000;
        }
      }
    }
  } catch (e) {}

  updateScreensaverModeUI();

  // Initialize Living Reef Aquarium Canvas
  if (window.Aquarium) {
    window.Aquarium.init();
    if (!ss.classList.contains('off') && screensaverMode === 'aquarium') {
      window.Aquarium.start();
    }
  }

  // Load local photos or Immich feed
  try {
    const res = await fetch('/api/photos');
    if (res.ok) {
      const data = await res.json();
      if (data.photos && data.photos.length > 0) {
        data.photos.forEach((p) => {
          SLIDESHOW_PHOTOS.unshift({ url: p.url, isDark: true, title: p.title });
        });
      }
    }
  } catch (e) {}

  // Tap listener on screensaver container
  ss.addEventListener('pointerdown', (e) => {
    // Top bar buttons and Spotify player handle their own interactions
    if (e.target.closest('#ss-top-bar') || e.target.closest('#ss-spotify')) {
      return;
    }
    // In photos mode, single tap anywhere immediately wakes to the dashboard
    if (screensaverMode === 'photos') {
      wakeFromScreensaver();
    }
    // In aquarium mode, single tap drops food pellets and double-tap wakes (handled by canvas)
  });

  // Track any activity on the window to reset the idle timer
  const events = ['pointerdown', 'pointermove', 'touchstart', 'keydown'];
  events.forEach((ev) => {
    window.addEventListener(ev, resetIdleTimer, { passive: true });
  });

  // Start initial timer
  resetIdleTimer();

  // Cycle photos periodically
  setInterval(nextPhoto, 35000);
  applyPhoto();
}

function updateScreensaverModeUI() {
  const ss = document.getElementById('screensaver');
  const label = document.getElementById('ss-mode-label');
  const feedBtn = document.getElementById('btn-ss-feed');

  if (screensaverMode === 'aquarium') {
    if (ss) {
      ss.classList.remove('mode-photos');
      ss.classList.add('mode-aquarium');
    }
    if (label) label.textContent = 'Aquarium';
    if (feedBtn) feedBtn.style.display = 'inline-flex';
    setScreensaverTone(true);
    if (window.Aquarium && ss && !ss.classList.contains('off')) {
      window.Aquarium.start();
    }
  } else {
    if (ss) {
      ss.classList.remove('mode-aquarium');
      ss.classList.add('mode-photos');
    }
    if (label) label.textContent = 'Photos';
    if (feedBtn) feedBtn.style.display = 'none';
    if (window.Aquarium) window.Aquarium.stop();
    applyPhoto();
  }
}

function toggleScreensaverMode(e) {
  if (e) e.stopPropagation();
  screensaverMode = screensaverMode === 'aquarium' ? 'photos' : 'aquarium';
  updateScreensaverModeUI();

  // Persist preference
  try {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screensaver: { mode: screensaverMode } })
    });
  } catch (err) {}
}

function feedFishFromHUD(e) {
  if (e) e.stopPropagation();
  if (window.Aquarium) {
    window.Aquarium.feed();
  }
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    enterScreensaver();
  }, IDLE_TIMEOUT_MS);
}

function enterScreensaver() {
  const ss = document.getElementById('screensaver');
  if (!ss) return;
  ss.classList.remove('off');
  if (screensaverMode === 'aquarium') {
    if (window.Aquarium) window.Aquarium.start();
    setScreensaverTone(true);
  } else {
    applyScreensaverContrast();
  }
}

function wakeFromScreensaver(e) {
  if (e) e.stopPropagation();
  const ss = document.getElementById('screensaver');
  if (!ss) return;
  ss.classList.add('off');
  if (window.Aquarium) window.Aquarium.stop();
  resetIdleTimer();
}

function nextPhoto() {
  photoIndex = (photoIndex + 1) % SLIDESHOW_PHOTOS.length;
  applyPhoto();
}

function applyPhoto() {
  const photoA = document.getElementById('photo-a');
  const photoB = document.getElementById('photo-b');
  if (!photoA || !photoB) return;

  const current = SLIDESHOW_PHOTOS[photoIndex];
  const media = window.mediaState || {};
  let targetUrl = current.url;

  if (isAlbumArtBackdrop && media.visible && media.backdrop_url) {
    targetUrl = media.backdrop_url;
  }

  // Crossfade between A and B
  const activeImg = photoA.classList.contains('show') ? photoB : photoA;
  const oldImg = photoA.classList.contains('show') ? photoA : photoB;

  activeImg.crossOrigin = 'anonymous';
  activeImg.onload = () => {
    analyzeAndApplyContrast(activeImg, current);
  };
  activeImg.src = targetUrl;
  activeImg.classList.add('show');
  oldImg.classList.remove('show');
}

function toggleAlbumArtBackdrop() {
  isAlbumArtBackdrop = !isAlbumArtBackdrop;
  const btn = document.getElementById('backdrop-btn');
  if (btn) {
    btn.textContent = isAlbumArtBackdrop ? 'Backdrop: Album Art' : 'Backdrop: Photo';
  }
  applyPhoto();
}

function analyzeAndApplyContrast(imgElement, fallbackMeta) {
  let isDark = fallbackMeta ? fallbackMeta.isDark : true;
  try {
    if (imgElement && imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Sample bottom-left 35% width and 30% height where clock & titles sit
        const sw = imgElement.naturalWidth * 0.35;
        const sh = imgElement.naturalHeight * 0.30;
        const sx = 0;
        const sy = imgElement.naturalHeight - sh;
        ctx.drawImage(imgElement, sx, sy, sw, sh, 0, 0, 32, 32);
        const imgData = ctx.getImageData(0, 0, 32, 32).data;
        let totalLuminance = 0;
        const pixelCount = imgData.length / 4;
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i] / 255;
          const g = imgData[i + 1] / 255;
          const b = imgData[i + 2] / 255;
          totalLuminance += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avgL = totalLuminance / pixelCount;
        // Dark background (L <= 0.30) requires white text; bright requires obsidian black text
        isDark = avgL <= 0.30;
      }
    }
  } catch (err) {
    // If CORS tainted, fall back to metadata
    isDark = fallbackMeta ? fallbackMeta.isDark : true;
  }
  setScreensaverTone(isDark);
}

function setScreensaverTone(isDark) {
  const clockCol = document.getElementById('ss-clock-col');
  const spotifyCard = document.getElementById('ss-spotify');
  const scrim = document.getElementById('ss-scrim');

  if (isDark) {
    // WHITE TEXT on dark background
    if (clockCol) {
      clockCol.classList.remove('tone-dark');
      clockCol.classList.add('tone-light');
    }
    if (spotifyCard) {
      spotifyCard.classList.remove('tone-dark');
      spotifyCard.classList.add('tone-light');
    }
    if (scrim) {
      scrim.style.background = 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 40%)';
    }
  } else {
    // OBSIDIAN BLACK TEXT on bright background
    if (clockCol) {
      clockCol.classList.remove('tone-light');
      clockCol.classList.add('tone-dark');
    }
    if (spotifyCard) {
      spotifyCard.classList.remove('tone-light');
      spotifyCard.classList.add('tone-dark');
    }
    if (scrim) {
      scrim.style.background = 'linear-gradient(to top, rgba(255,255,255,0.45) 0%, transparent 40%)';
    }
  }
}

function applyScreensaverContrast() {
  const photoA = document.getElementById('photo-a');
  const photoB = document.getElementById('photo-b');
  const current = SLIDESHOW_PHOTOS[photoIndex];
  const activeImg = (photoB && photoB.classList.contains('show')) ? photoB : photoA;

  if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
    analyzeAndApplyContrast(activeImg, current);
  } else {
    setScreensaverTone(current ? current.isDark : true);
  }
}
