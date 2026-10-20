// OmniHub Navigation Dock & Quick Settings

function initDock() {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;

  let scrollTimeout;
  carousel.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const pageWidth = carousel.clientWidth;
      const pageIdx = Math.round(carousel.scrollLeft / pageWidth);
      updateDockIndicators(pageIdx);
    }, 50);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    const pageWidth = carousel.clientWidth;
    const currentIdx = Math.round(carousel.scrollLeft / pageWidth);
    if (e.key === 'ArrowRight' && currentIdx < 5) scrollToPage(currentIdx + 1);
    if (e.key === 'ArrowLeft' && currentIdx > 0) scrollToPage(currentIdx - 1);
  });

  updateLiveClock();
  setInterval(updateLiveClock, 1000);
}

function scrollToPage(pageIndex) {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;
  carousel.scrollTo({
    left: pageIndex * carousel.clientWidth,
    behavior: 'smooth'
  });
  updateDockIndicators(pageIndex);
}

function updateDockIndicators(activeIdx) {
  for (let i = 0; i <= 5; i++) {
    const btn = document.getElementById(`dock-btn-${i}`);
    if (btn) {
      if (i === activeIdx) {
        btn.className = "w-11 h-11 rounded-2xl bg-white text-stone-950 flex items-center justify-center font-bold shadow-lg transition";
      } else {
        btn.className = "w-11 h-11 rounded-2xl bg-stone-900 border border-stone-800 text-stone-400 hover:text-white flex items-center justify-center transition";
      }
    }
  }
}

function updateLiveClock() {
  const now = new Date();
  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Dock Clock
  const dockClock = document.getElementById('dock-clock');
  if (dockClock) dockClock.textContent = `${timeStr} ${ampm}`;

  // Screensaver Clock
  const immichClockDigits = document.getElementById('immich-clock-digits');
  if (immichClockDigits) {
    immichClockDigits.innerHTML = `${timeStr}<span id="immich-clock-ampm" class="text-3xl text-stone-400 font-normal ml-3">${ampm}</span>`;
  }

  // Home Screen Clock
  const mainClockDigits = document.getElementById('main-clock-digits');
  if (mainClockDigits) {
    mainClockDigits.innerHTML = `${timeStr}<span class="text-4xl text-stone-500 font-normal ml-3">${ampm}</span>`;
  }
}

function toggleQuickSettings() {
  const drawer = document.getElementById('quick-settings');
  if (drawer) drawer.classList.toggle('hidden');
}

function toggleVoice() {
  const bar = document.getElementById('voice-bar');
  if (bar) bar.classList.toggle('hidden');
}

function toggleLightPill(btn) {
  if (btn.textContent === 'ON') {
    btn.textContent = 'OFF';
    btn.className = 'px-4 py-2 rounded-full bg-stone-800 text-stone-400 font-bold text-xs';
  } else {
    btn.textContent = 'ON';
    btn.className = 'px-4 py-2 rounded-full bg-white text-stone-900 font-bold text-xs shadow-md';
  }
}
