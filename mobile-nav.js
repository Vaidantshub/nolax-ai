/**
 * Nolax Mobile Navigation Controller
 * Handles mobile hamburger toggle, smooth drawer slide, and active link closing.
 */
(function initMobileNav() {
  function setup() {
    const btn = document.getElementById('mobileMenuBtn');
    const menu = document.getElementById('mobileMenu');
    if (!btn || !menu) return;

    const openIcon = btn.querySelector('.menu-open-icon');
    const closeIcon = btn.querySelector('.menu-close-icon');

    function toggleMenu(forceState) {
      const isHidden = menu.classList.contains('hidden');
      const shouldOpen = typeof forceState === 'boolean' ? forceState : isHidden;

      if (shouldOpen) {
        menu.classList.remove('hidden');
        if (openIcon) openIcon.classList.add('hidden');
        if (closeIcon) closeIcon.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
      } else {
        menu.classList.add('hidden');
        if (openIcon) openIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close when clicking any nav link
    const links = menu.querySelectorAll('.mobile-nav-link, a');
    links.forEach(link => {
      link.addEventListener('click', () => {
        toggleMenu(false);
      });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) {
        toggleMenu(false);
      }
    });

    // Close on resize above mobile breakpoint
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) {
        toggleMenu(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

