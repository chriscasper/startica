// Theme toggle and mobile menu (initial theme is set inline in <head>)
(() => {
  const root = document.documentElement;
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('startica-theme', next); } catch {}
    });
  });

  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.getElementById('mobile-menu');
  toggle?.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });

  // /download: mark the card for this system and, on a Mac whose browser says which chip it has,
  // make that installer the main button. Safari doesn't say, so Apple Silicon stays first there.
  const cards = document.querySelectorAll('.download-card');
  if (cards.length) {
    const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
    const os = /mac/.test(platform) ? 'macos' : /win/.test(platform) ? 'windows' : /linux/.test(platform) && !/android/.test(platform) ? 'linux' : null;
    const card = os && document.querySelector(`.download-card[data-os="${os}"]`);
    if (card) {
      card.dataset.yours = '';
      card.querySelector('.download-yours').classList.remove('hidden');
    }
    if (os === 'macos') {
      navigator.userAgentData?.getHighEntropyValues(['architecture']).then(({ architecture }) => {
        if (architecture !== 'x86') return;
        const links = card.querySelectorAll('.download-link');
        links.forEach((link) => {
          const intel = link.dataset.installer === 'mac-x64';
          link.classList.toggle('btn-primary', intel);
          link.classList.toggle('btn-ghost', !intel);
          if (intel) link.parentElement.prepend(link);
        });
      }).catch(() => {});
    }
  }
})();
