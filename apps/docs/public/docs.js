// Docs page behavior: theme toggle, mobile nav, on-page TOC, copy buttons, search dialog.
(() => {
  const root = document.documentElement;

  // Theme toggle (initial theme is set inline in <head>)
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('startica-theme', next); } catch {}
    });
  });

  // Mobile navigation
  const navToggle = document.querySelector('[data-nav-toggle]');
  const backdrop = document.querySelector('[data-nav-backdrop]');
  const setNav = (open) => {
    document.body.classList.toggle('nav-open', open);
    if (backdrop) backdrop.hidden = !open;
    navToggle?.setAttribute('aria-expanded', String(open));
  };
  navToggle?.addEventListener('click', () => setNav(true));
  backdrop?.addEventListener('click', () => setNav(false));
  document.querySelector('[data-nav-close]')?.addEventListener('click', () => setNav(false));
  // Keep the current page visible in the sidebar without scrolling the window
  const panel = document.querySelector('[data-nav-panel]');
  const currentLink = panel?.querySelector('[aria-current="page"]');
  if (panel && currentLink) {
    panel.scrollTop = currentLink.offsetTop - panel.clientHeight / 2;
  }

  const content = document.querySelector('[data-content]');

  // Callouts: the production build converts them (scripts/postbuild.mjs); this covers `yarn dev:docs`
  content?.querySelectorAll('blockquote').forEach((quote) => {
    const first = quote.querySelector(':scope > p:first-child');
    const match = first?.innerHTML.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(<br\s*\/?>)?\s*/);
    if (!match) return;
    const type = match[1].toLowerCase();
    const box = document.createElement('div');
    box.className = `callout callout-${type}`;
    box.setAttribute('role', 'note');
    box.innerHTML = `<p class="callout-title">${type[0].toUpperCase() + type.slice(1)}</p>`;
    first.innerHTML = first.innerHTML.slice(match[0].length);
    if (!first.innerHTML.trim()) first.remove();
    box.append(...quote.childNodes);
    quote.replaceWith(box);
  });

  // On this page
  const toc = document.querySelector('[data-toc]');
  const tocList = document.querySelector('[data-toc-list]');
  const headings = content ? [...content.querySelectorAll('h2[id], h3[id]')] : [];
  if (toc && tocList && headings.length > 1) {
    for (const heading of headings) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${heading.id}`;
      a.textContent = heading.textContent.replace(/\s*#$/, '');
      a.className = `-ml-px block border-l-2 border-transparent text-muted hover:text-fg ${heading.tagName === 'H3' ? 'pl-7' : 'pl-4'}`;
      li.append(a);
      tocList.append(li);
    }
    toc.hidden = false;
    const links = [...tocList.querySelectorAll('a')];
    const setActive = () => {
      let current = 0;
      headings.forEach((heading, i) => {
        if (heading.getBoundingClientRect().top < 120) current = i;
      });
      links.forEach((link, i) => link.classList.toggle('is-active', i === current));
    };
    addEventListener('scroll', setActive, { passive: true });
    setActive();
  }

  // Copy buttons on code blocks
  content?.querySelectorAll('pre').forEach((pre) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.querySelector('code')?.innerText ?? pre.innerText);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Press ⌘C';
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    });
    pre.append(button);
  });

  // Search (Pagefind UI, loaded on first open)
  const dialog = document.getElementById('search');
  let searchLoaded = null;
  const loadSearch = () => {
    searchLoaded ??= new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/pagefind/pagefind-ui.css';
      document.head.append(css);
      const script = document.createElement('script');
      script.src = '/pagefind/pagefind-ui.js';
      script.onload = () => {
        // eslint-disable-next-line no-undef
        new PagefindUI({ element: '#search-ui', showSubResults: true, showImages: false, autofocus: true, resetStyles: false });
        resolve();
      };
      script.onerror = reject;
      document.head.append(script);
    }).catch(() => {
      document.getElementById('search-unavailable').hidden = false;
    });
    return searchLoaded;
  };
  const openSearch = async () => {
    if (!dialog) return;
    dialog.showModal();
    await loadSearch();
    dialog.querySelector('input')?.focus();
  };
  document.querySelectorAll('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
  document.querySelector('[data-search-close]')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      openSearch();
    }
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) {
    document.querySelectorAll('[data-search-kbd]').forEach((kbd) => { kbd.textContent = 'Ctrl K'; });
  }
})();
