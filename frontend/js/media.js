// OmniHub Media & Spotify Connect Subsystem
// Strictly hides cards and controls when music is NOT playing.

window.mediaState = {
  is_active: false,
  is_playing: false,
  visible: false,
  track: "",
  artist: "",
  cover_url: "",
  backdrop_url: "",
  duration_seconds: 0,
  position_seconds: 0
};

async function initMedia() {
  bindControls();
  fetchMediaState();
  setInterval(fetchMediaState, 2500); // 2.5s poll for snappy state sync
}

function bindControls() {
  document.querySelectorAll('[data-controls]').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'toggle') toggleMusicPlayback();
      else if (action === 'next') skipNextTrack();
      else if (action === 'previous') skipPreviousTrack();
      else if (action === 'fwd15') seekRelative(15);
      else if (action === 'back15') seekRelative(-15);
    });
  });

  const backdropBtn = document.getElementById('backdrop-btn');
  if (backdropBtn) {
    backdropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof toggleAlbumArtBackdrop === 'function') toggleAlbumArtBackdrop();
    });
  }
}

async function fetchMediaState() {
  try {
    const res = await fetch('/api/media');
    if (res.ok) {
      const state = await res.json();
      window.mediaState = state;
      updateMediaUI();
    }
  } catch (e) {}
}

async function toggleMusicPlayback() {
  try {
    const res = await fetch('/api/media/toggle', { method: 'POST' });
    if (res.ok) {
      window.mediaState = await res.json();
      updateMediaUI();
    }
  } catch (e) {}
}

async function skipNextTrack() {
  try {
    const res = await fetch('/api/media/next', { method: 'POST' });
    if (res.ok) {
      window.mediaState = await res.json();
      updateMediaUI();
    }
  } catch (e) {}
}

async function skipPreviousTrack() {
  try {
    const res = await fetch('/api/media/previous', { method: 'POST' });
    if (res.ok) {
      window.mediaState = await res.json();
      updateMediaUI();
    }
  } catch (e) {}
}

async function seekRelative(seconds) {
  try {
    const res = await fetch('/api/media/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds })
    });
    if (res.ok) {
      window.mediaState = await res.json();
      updateMediaUI();
    }
  } catch (e) {}
}

function updateMediaUI() {
  const m = window.mediaState || {};
  const isVisible = Boolean(m.visible && m.track);

  // 1. Dashboard Right Card Spotify
  const cardSpotify = document.getElementById('card-spotify');
  const dockPlayer = document.getElementById('dock-center-player');
  const ssSpotify = document.getElementById('ss-spotify');

  if (cardSpotify) {
    if (isVisible) {
      cardSpotify.classList.remove('hidden');
    } else {
      cardSpotify.classList.add('hidden');
    }
  }

  // 2. Dock Center Mini Pill (only visible if playing)
  if (dockPlayer) {
    if (isVisible) {
      dockPlayer.classList.remove('hidden');
      const dTitle = document.getElementById('dock-title');
      const dArtist = document.getElementById('dock-artist');
      const dThumb = document.getElementById('dock-thumb');
      if (dTitle) dTitle.textContent = m.track;
      if (dArtist) dArtist.textContent = m.artist;
      if (dThumb && m.cover_url) dThumb.src = m.cover_url;
    } else {
      dockPlayer.classList.add('hidden');
    }
  }

  // 3. Screensaver Spotify Card (only visible if playing)
  if (ssSpotify) {
    if (isVisible) {
      ssSpotify.classList.remove('hidden');
    } else {
      ssSpotify.classList.add('hidden');
    }
  }

  if (!isVisible) return;

  // 4. Update track details across all cards
  const titleEls = [document.getElementById('hp-title'), document.getElementById('ss-title')];
  const artistEls = [document.getElementById('hp-artist'), document.getElementById('ss-artist')];
  const coverEls = [document.getElementById('hp-cover'), document.getElementById('ss-cover')];

  titleEls.forEach(el => { if (el) el.textContent = m.track; });
  artistEls.forEach(el => { if (el) el.textContent = m.artist; });
  coverEls.forEach(el => { if (el && m.cover_url) el.src = m.cover_url; });

  // 5. Scrubber Progress Fill
  const duration = m.duration_seconds || 1;
  const pos = m.position_seconds || 0;
  const pct = Math.min(100, (pos / duration) * 100);

  const hpBar = document.getElementById('hp-bar');
  const ssFill = document.getElementById('ss-fill');
  if (hpBar) hpBar.style.width = `${pct}%`;
  if (ssFill) ssFill.style.width = `${pct}%`;

  const elapsedStr = formatTime(pos);
  const durStr = formatTime(duration);
  const elElapsed = document.getElementById('sp-time-elapsed');
  const elTotal = document.getElementById('sp-time-total');
  const ssElapsed = document.getElementById('ss-elapsed');
  const ssDur = document.getElementById('ss-duration');

  if (elElapsed) elElapsed.textContent = elapsedStr;
  if (elTotal) elTotal.textContent = durStr;
  if (ssElapsed) ssElapsed.textContent = elapsedStr;
  if (ssDur) ssDur.textContent = durStr;

  // 6. Play/Pause Icons
  const playIcons = document.querySelectorAll('[data-playicon]');
  playIcons.forEach((btn) => {
    if (m.is_playing) {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z"/></svg>';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6L19 12z"/></svg>';
    }
  });

  // Re-evaluate contrast on screensaver if active
  if (typeof applyScreensaverContrast === 'function') {
    applyScreensaverContrast();
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}
