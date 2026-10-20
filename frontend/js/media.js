// OmniHub Media & Spotify Connect Subsystem

window.mediaState = {
  is_active: true,
  is_playing: true,
  track: "Weightless",
  artist: "Marconi Union • Transmissions Vol. 2",
  device: "Surface Go 2 • Living Room",
  cover_url: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80",
  backdrop_url: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=2560&q=85",
  duration_seconds: 480,
  position_seconds: 108,
  is_dark_like_yosemite: true
};

async function initMedia() {
  try {
    const res = await fetch('/api/media');
    if (res.ok) {
      window.mediaState = await res.json();
    }
  } catch (e) {
    console.log("[Media] Using local state");
  }
  updateMediaUI();
  
  // Periodic poll for background librespot / Spotify Connect state
  setInterval(pollMediaState, 4000);
}

async function pollMediaState() {
  try {
    const res = await fetch('/api/media');
    if (res.ok) {
      window.mediaState = await res.json();
      updateMediaUI();
    }
  } catch (e) {}
}

async function toggleMusicPlayback(e) {
  if (e) e.stopPropagation();
  try {
    const res = await fetch('/api/media/toggle', { method: 'POST' });
    if (res.ok) window.mediaState = await res.json();
    else window.mediaState.is_playing = !window.mediaState.is_playing;
  } catch (err) {
    window.mediaState.is_playing = !window.mediaState.is_playing;
  }
  updateMediaUI();
  if (typeof applyScreensaverState === 'function') applyScreensaverState();
}

async function skipNextTrack(e) {
  if (e) e.stopPropagation();
  try {
    const res = await fetch('/api/media/next', { method: 'POST' });
    if (res.ok) window.mediaState = await res.json();
  } catch (err) {
    // Local fallback toggle
    if (window.mediaState.track === "Weightless") {
      window.mediaState.track = "Dayvan Cowboy";
      window.mediaState.artist = "Boards of Canada • The Campfire Headphase";
      window.mediaState.cover_url = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=600&q=80";
      window.mediaState.backdrop_url = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=2560&q=85";
      window.mediaState.is_dark_like_yosemite = false;
      window.mediaState.duration_seconds = 301;
      window.mediaState.position_seconds = 0;
    } else {
      window.mediaState.track = "Weightless";
      window.mediaState.artist = "Marconi Union • Transmissions Vol. 2";
      window.mediaState.cover_url = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=600&q=80";
      window.mediaState.backdrop_url = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&w=2560&q=85";
      window.mediaState.is_dark_like_yosemite = true;
      window.mediaState.duration_seconds = 480;
      window.mediaState.position_seconds = 0;
    }
  }
  updateMediaUI();
  if (typeof applyScreensaverState === 'function') applyScreensaverState();
}

async function skipPreviousTrack(e) {
  if (e) e.stopPropagation();
  try {
    const res = await fetch('/api/media/previous', { method: 'POST' });
    if (res.ok) window.mediaState = await res.json();
  } catch (err) {
    window.mediaState.position_seconds = 0;
  }
  updateMediaUI();
  if (typeof applyScreensaverState === 'function') applyScreensaverState();
}

async function seekRelative(seconds, e) {
  if (e) e.stopPropagation();
  try {
    const res = await fetch('/api/media/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json.stringify({ seconds })
    });
    if (res.ok) window.mediaState = await res.json();
  } catch (err) {
    window.mediaState.position_seconds = Math.max(
      0, min(window.mediaState.duration_seconds, window.mediaState.position_seconds + seconds)
    );
  }
  updateMediaUI();
}

async function toggleMusicActiveState() {
  const nextActive = !window.mediaState.is_active;
  try {
    const res = await fetch('/api/media/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: nextActive })
    });
    if (res.ok) window.mediaState = await res.json();
    else window.mediaState.is_active = nextActive;
  } catch (err) {
    window.mediaState.is_active = nextActive;
  }
  updateMediaUI();
  if (typeof applyScreensaverState === 'function') applyScreensaverState();
}

function updateMediaUI() {
  const m = window.mediaState;
  
  // 1. Screensaver Elements
  const hero = document.getElementById('immich-spotify-hero');
  const title = document.getElementById('immich-spotify-title');
  const artist = document.getElementById('immich-spotify-artist');
  const cover = document.getElementById('immich-spotify-cover');
  const playBtn = document.getElementById('immich-spotify-playbtn');
  const progEl = document.getElementById('immich-spotify-prog');
  const timeElapsed = document.getElementById('immich-spotify-time-elapsed');

  if (hero) {
    if (m.is_active) hero.classList.remove('hidden');
    else hero.classList.add('hidden');
  }

  if (title) title.textContent = m.track;
  if (artist) artist.textContent = m.artist;
  if (cover) cover.src = m.cover_url;

  if (playBtn) {
    if (m.is_playing) {
      playBtn.innerHTML = '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';
    } else {
      playBtn.innerHTML = '<svg class="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    }
  }

  if (timeElapsed && m.position_seconds !== undefined) {
    const mins = Math.floor(m.position_seconds / 60);
    const secs = String(m.position_seconds % 60).padStart(2, '0');
    timeElapsed.textContent = `${mins}:${secs}`;
  }

  if (progEl && m.duration_seconds) {
    const pct = Math.max(2, Math.min(100, (m.position_seconds / m.duration_seconds) * 100));
    progEl.style.width = `${pct}%`;
  }

  // 2. Home Dashboard Capsule
  const homeSpotify = document.getElementById('home-spotify-capsule');
  const alarmCapsule = document.getElementById('home-alarm-capsule');
  const lightsCapsule = document.getElementById('home-lights-capsule');
  const simBtn = document.getElementById('spotify-sim-btn');
  const quickBackdropRow = document.getElementById('quick-backdrop-row');

  if (homeSpotify) {
    if (m.is_active) {
      homeSpotify.classList.remove('hidden');
      if (alarmCapsule) alarmCapsule.className = "col-span-4 flow-capsule p-4 cursor-pointer flex items-center space-x-4 transition-all duration-300";
      if (lightsCapsule) lightsCapsule.className = "col-span-4 flow-capsule p-4 flex items-center justify-between transition-all duration-300";
    } else {
      homeSpotify.classList.add('hidden');
      if (alarmCapsule) alarmCapsule.className = "col-span-6 flow-capsule p-4 cursor-pointer flex items-center space-x-4 transition-all duration-300";
      if (lightsCapsule) lightsCapsule.className = "col-span-6 flow-capsule p-4 flex items-center justify-between transition-all duration-300";
    }
  }

  if (simBtn) {
    if (m.is_active) {
      simBtn.textContent = "MUSIC STATUS: ACTIVE (STREAMING)";
      simBtn.className = "px-4 py-2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold text-xs";
    } else {
      simBtn.textContent = "MUSIC STATUS: INACTIVE (IDLE / HIDDEN)";
      simBtn.className = "px-4 py-2 rounded-full bg-stone-900 text-stone-400 border border-stone-800 font-bold text-xs";
    }
  }

  if (quickBackdropRow) {
    if (m.is_active) quickBackdropRow.classList.remove('opacity-40', 'pointer-events-none');
    else quickBackdropRow.classList.add('opacity-40', 'pointer-events-none');
  }
}
