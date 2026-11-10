// 3D Isometric Box Loader (1 to 100 Preloader)
(function initGlobalPreloader() {
  if (window.__nolaxPreloaderInitialized) return;
  window.__nolaxPreloaderInitialized = true;

  function runCounter(preloader, counter, bar) {
    let progress = 0;
    const duration = 1100; // ms
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      progress = Math.min(100, Math.floor((elapsed / duration) * 100));
      
      if (counter) counter.textContent = progress;
      if (bar) bar.style.width = progress + '%';

      if (progress < 100) {
        requestAnimationFrame(update);
      } else {
        setTimeout(() => {
          preloader.style.opacity = '0';
          preloader.style.transform = 'scale(1.03)';
          preloader.style.pointerEvents = 'none';
          setTimeout(() => {
            if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
          }, 700);
        }, 150);
      }
    }
    requestAnimationFrame(update);
  }

  const existing = document.getElementById('sitePreloader');
  if (existing) {
    runCounter(existing, document.getElementById('preloaderCount'), document.getElementById('preloaderBar'));
    return;
  }

  const preloader = document.createElement('div');
  preloader.id = 'sitePreloader';
  preloader.className = 'fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#07090e] text-white transition-all duration-700 select-none';
  preloader.innerHTML = `
    <div class="relative flex flex-col items-center justify-center p-8 text-center">
      <div class="mb-14 relative flex items-center justify-center">
        <div class="boxes">
          <div class="box box-1">
            <div class="face face-front"></div>
            <div class="face face-right"></div>
            <div class="face face-top"></div>
            <div class="face face-back"></div>
          </div>
          <div class="box box-2">
            <div class="face face-front"></div>
            <div class="face face-right"></div>
            <div class="face face-top"></div>
            <div class="face face-back"></div>
          </div>
          <div class="box box-3">
            <div class="face face-front"></div>
            <div class="face face-right"></div>
            <div class="face face-top"></div>
            <div class="face face-back"></div>
          </div>
          <div class="box box-4">
            <div class="face face-front"></div>
            <div class="face face-right"></div>
            <div class="face face-top"></div>
            <div class="face face-back"></div>
          </div>
        </div>
      </div>
      <div class="font-mono text-5xl sm:text-6xl font-black tracking-tight text-white mb-4 drop-shadow-[0_4px_24px_rgba(56,118,186,0.6)]">
        <span id="preloaderCount">0</span><span class="text-[#8cbfe8] text-3xl font-bold ml-1">%</span>
      </div>
      <div class="w-56 sm:w-72 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/10 shadow-inner">
        <div id="preloaderBar" class="h-full bg-gradient-to-r from-[#3876ba] via-[#8cbfe8] to-white w-0 transition-all duration-75"></div>
      </div>
      <div class="text-[10px] font-mono text-slate-400 uppercase tracking-widest mt-4">
        Loading Autonomous Orderbook Streams...
      </div>
    </div>
  `;

  document.body.appendChild(preloader);
  runCounter(preloader, preloader.querySelector('#preloaderCount'), preloader.querySelector('#preloaderBar'));
})();

