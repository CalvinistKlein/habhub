// OmniHub Screensaver & Automatic Contrast Engine

const SLIDESHOW_PHOTOS = [
  {
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2560&q=85",
    location: "Yosemite Valley",
    date: "Immich Server • July 2024",
    camera: "Sony A7 IV • 24mm f/2.8",
    // Calibrated baseline: Yosemite bottom-left is dark -> text is white
    isDarkLikeYosemite: true
  },
  {
    url: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=2560&q=85",
    location: "Alps Snow Summit",
    date: "Immich Server • Jan 2025",
    camera: "Sony A7 IV • 35mm f/1.4",
    // Bright mountain snow -> text is black
    isDarkLikeYosemite: false
  }
];

let currentPhotoIdx = 0;
let isAlbumBackdrop = false;
let idleTimer = null;
const IDLE_TIMEOUT_MS = 60000; // 60 seconds

function initScreensaver() {
  const overlay = document.getElementById('immich-screensaver');
  if (!overlay) return;

  // Touch gesture swipe up listener
  let touchStartY = 0;
  overlay.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  overlay.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    if (touchStartY - touchEndY > 50) {
      wakeFromScreensaver();
    }
  }, { passive: true });

  // Reset timer on user interaction
  window.addEventListener('pointerdown', resetIdleTimer, { passive: true });
  window.addEventListener('keydown', resetIdleTimer, { passive: true });

  resetIdleTimer();
  applyScreensaverState();
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    enterScreensaver();
  }, IDLE_TIMEOUT_MS);
}

function enterScreensaver() {
  const overlay = document.getElementById('immich-screensaver');
  if (!overlay) return;
  overlay.classList.remove('hidden', 'pointer-events-none');
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
  }, 20);
}

function wakeFromScreensaver() {
  const overlay = document.getElementById('immich-screensaver');
  if (!overlay) return;
  overlay.classList.remove('opacity-100');
  overlay.classList.add('opacity-0');
  setTimeout(() => {
    overlay.classList.add('hidden', 'pointer-events-none');
  }, 700);
  resetIdleTimer();
}

function toggleAlbumArtBackdrop(e) {
  if (e) e.stopPropagation();
  if (!window.mediaState || !window.mediaState.is_active) {
    alert("Spotify Connect is currently idle. Start playback to display album art.");
    return;
  }
  isAlbumBackdrop = !isAlbumBackdrop;
  applyScreensaverState();
}

function cycleScreensaverPhoto(e) {
  if (e) e.stopPropagation();
  if (isAlbumBackdrop && window.mediaState && window.mediaState.is_active) {
    if (typeof skipNextTrack === 'function') skipNextTrack(e);
  } else {
    currentPhotoIdx = (currentPhotoIdx + 1) % SLIDESHOW_PHOTOS.length;
    applyScreensaverState();
  }
}

function applyScreensaverState() {
  const img = document.getElementById('immich-img');
  const backdropLabel = document.getElementById('immich-backdrop-label');
  const locPill = document.getElementById('immich-location-pill');
  const metaRow = document.getElementById('immich-meta-row');
  const quickBackdropBtnText = document.getElementById('quick-backdrop-btn-text');

  const media = window.mediaState || {};
  const isShowingAlbumBackdrop = media.is_active && isAlbumBackdrop;
  let isDarkLikeYosemite = true;

  if (isShowingAlbumBackdrop) {
    img.src = media.backdrop_url || media.cover_url;
    isDarkLikeYosemite = media.is_dark_like_yosemite !== false;

    if (backdropLabel) backdropLabel.textContent = "Backdrop: Album Art";
    if (quickBackdropBtnText) quickBackdropBtnText.textContent = "Spotify Album Art (Active)";
    if (locPill) locPill.textContent = "Album Backdrop Active";
    if (metaRow && metaRow.children.length >= 4) {
      metaRow.children[1].textContent = media.artist || "Spotify Connect";
      metaRow.children[3].textContent = "FLAC Lossless • Spotify Connect";
    }
  } else {
    const photo = SLIDESHOW_PHOTOS[currentPhotoIdx];
    img.src = photo.url;
    isDarkLikeYosemite = photo.isDarkLikeYosemite;

    if (backdropLabel) backdropLabel.textContent = "Backdrop: Photo";
    if (quickBackdropBtnText) quickBackdropBtnText.textContent = "Photo Backdrop (Click to change)";
    if (locPill) locPill.textContent = photo.location;
    if (metaRow && metaRow.children.length >= 4) {
      metaRow.children[1].textContent = photo.date;
      metaRow.children[3].textContent = photo.camera;
    }
  }

  // Pure automatic contrast application
  applyAutomaticContrast(isDarkLikeYosemite);
}

function applyAutomaticContrast(isDark) {
  const digits = document.getElementById('immich-clock-digits');
  const ampm = document.getElementById('immich-clock-ampm');
  const weatherText = document.getElementById('immich-weather-text');
  const weatherTemp = document.getElementById('immich-weather-temp');
  const locPill = document.getElementById('immich-location-pill');
  const metaRow = document.getElementById('immich-meta-row');
  const swipeBar = document.getElementById('immich-swipe-bar');

  // Spotify Elements
  const spotifyTitle = document.getElementById('immich-spotify-title');
  const spotifyArtist = document.getElementById('immich-spotify-artist');
  const spotifyDevice = document.getElementById('immich-spotify-device');
  const spotifyProg = document.getElementById('immich-spotify-prog');
  const spotifyPlayBtn = document.getElementById('immich-spotify-playbtn');
  const spotifyControls = document.getElementById('immich-spotify-controls');
  const backdropBtn = document.getElementById('immich-backdrop-toggle-btn');

  if (isDark) {
    // AS DARK AS YOSEMITE BOTTOM LEFT -> CRISP WHITE TEXT
    if (digits) digits.className = "text-[7.5rem] font-light text-white tracking-tight leading-none transition-colors duration-500 hud-shadow";
    if (ampm) ampm.className = "text-3xl text-stone-400 font-normal ml-3";
    if (weatherText) weatherText.className = "text-xl font-normal text-stone-200 mt-2 flex items-center space-x-3 transition-colors duration-500 hud-shadow";
    if (weatherTemp) weatherTemp.className = "text-stone-300";
    if (metaRow) metaRow.className = "mt-4 flex items-center space-x-3 text-xs text-stone-400 font-mono";
    if (locPill) locPill.className = "px-2.5 py-1 rounded-md bg-white/10 text-white font-normal transition-colors";
    if (swipeBar) swipeBar.className = "w-36 h-1.5 rounded-full bg-white/40 mt-1 transition-colors duration-500";

    if (spotifyTitle) spotifyTitle.className = "text-3xl font-light text-white tracking-tight leading-tight truncate transition-colors duration-500";
    if (spotifyArtist) spotifyArtist.className = "text-sm font-normal text-stone-300 truncate transition-colors duration-500 mt-0.5";
    if (spotifyDevice) spotifyDevice.className = "text-xs text-stone-400 font-mono mt-1";
    if (spotifyProg) spotifyProg.className = "h-full bg-white rounded-full transition-colors duration-500";
    if (spotifyPlayBtn) spotifyPlayBtn.className = "w-14 h-14 rounded-full bg-white text-stone-950 flex items-center justify-center font-bold text-xl hover:scale-105 transition shadow-2xl";
    if (backdropBtn) backdropBtn.className = "px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-mono text-stone-200 transition flex items-center space-x-2";

    if (spotifyControls) {
      const btns = spotifyControls.querySelectorAll('button:not(#immich-spotify-playbtn)');
      btns.forEach(b => b.className = "w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-stone-200 hover:text-white flex items-center justify-center transition");
    }
  } else {
    // BRIGHTER THAN YOSEMITE BOTTOM LEFT -> SHARP OBSIDIAN BLACK TEXT
    if (digits) digits.className = "text-[7.5rem] font-light text-stone-950 tracking-tight leading-none transition-colors duration-500 drop-shadow-[0_2px_18px_rgba(255,255,255,0.95)]";
    if (ampm) ampm.className = "text-3xl text-stone-700 font-normal ml-3";
    if (weatherText) weatherText.className = "text-xl font-normal text-stone-950 mt-2 flex items-center space-x-3 transition-colors duration-500 drop-shadow-[0_2px_12px_rgba(255,255,255,0.85)]";
    if (weatherTemp) weatherTemp.className = "text-stone-800 font-medium";
    if (metaRow) metaRow.className = "mt-4 flex items-center space-x-3 text-xs text-stone-800 font-mono";
    if (locPill) locPill.className = "px-2.5 py-1 rounded-md bg-stone-950/20 text-stone-950 font-semibold border border-stone-950/30 transition-colors";
    if (swipeBar) swipeBar.className = "w-36 h-1.5 rounded-full bg-stone-950/70 mt-1 transition-colors duration-500";

    if (spotifyTitle) spotifyTitle.className = "text-3xl font-light text-stone-950 tracking-tight leading-tight truncate transition-colors duration-500 drop-shadow-[0_1px_8px_rgba(255,255,255,0.8)]";
    if (spotifyArtist) spotifyArtist.className = "text-sm font-medium text-stone-800 truncate transition-colors duration-500 mt-0.5";
    if (spotifyDevice) spotifyDevice.className = "text-xs text-stone-700 font-mono mt-1";
    if (spotifyProg) spotifyProg.className = "h-full bg-stone-950 rounded-full transition-colors duration-500";
    if (spotifyPlayBtn) spotifyPlayBtn.className = "w-14 h-14 rounded-full bg-stone-950 text-white flex items-center justify-center font-bold text-xl hover:scale-105 transition shadow-2xl";
    if (backdropBtn) backdropBtn.className = "px-3.5 py-1.5 rounded-full bg-stone-950/20 hover:bg-stone-950/30 text-xs font-mono text-stone-950 border border-stone-950/20 transition flex items-center space-x-2";

    if (spotifyControls) {
      const btns = spotifyControls.querySelectorAll('button:not(#immich-spotify-playbtn)');
      btns.forEach(b => b.className = "w-11 h-11 rounded-full bg-stone-950/15 hover:bg-stone-950/25 text-stone-950 flex items-center justify-center transition border border-stone-950/20");
    }
  }
}
