// OmniHub Idle Screensaver & Automatic Contrast Engine
// Calibrated baseline: Dark pine/twilight bottom-left Yosemite -> White text. Otherwise Black.
// Returns to photo screensaver after a couple seconds of inactivity.

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
const IDLE_TIMEOUT_MS = 10000; // 10 seconds of inactivity -> back to photo screensaver

async function initScreensaver() {
  const ss = document.getElementById('screensaver');
  if (!ss) return;

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

  // Tap anywhere on screensaver to wake up to dashboard
  ss.addEventListener('pointerdown', () => {
    wakeFromScreensaver();
  });

  // Track any activity on the window to reset the 10-second idle timer
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
  applyScreensaverContrast();
}

function wakeFromScreensaver() {
  const ss = document.getElementById('screensaver');
  if (!ss) return;
  ss.classList.add('off');
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
  if (photoA.classList.contains('show')) {
    photoB.src = targetUrl;
    photoB.classList.add('show');
    photoA.classList.remove('show');
  } else {
    photoA.src = targetUrl;
    photoA.classList.add('show');
    photoB.classList.remove('show');
  }

  applyScreensaverContrast();
}

function toggleAlbumArtBackdrop() {
  isAlbumArtBackdrop = !isAlbumArtBackdrop;
  const btn = document.getElementById('backdrop-btn');
  if (btn) {
    btn.textContent = isAlbumArtBackdrop ? 'Backdrop: Album Art' : 'Backdrop: Photo';
  }
  applyPhoto();
}

function applyScreensaverContrast() {
  const current = SLIDESHOW_PHOTOS[photoIndex];
  const isDark = current ? current.isDark : true;

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
