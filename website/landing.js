(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 639px)');
  const header = document.querySelector('.site-header');
  const motions = new Map();
  const zh = document.documentElement.lang.startsWith('zh');
  let scheduled = false;
  const clamp = (value) => Math.max(0, Math.min(1, value));

  function syncMotions() {
    motions.forEach((state, element) => {
      const running = state.inView && !document.hidden && !state.finished;
      if (!state.ready) return;
      const command = JSON.stringify({
        type: 'brevia-motion-state',
        running,
        reduced: reducedMotion.matches,
      });
      if (command === state.command) return;
      state.command = command;
      state.frame.contentWindow.postMessage(JSON.parse(command), location.origin);
    });
  }

  function configureMotion(element, state) {
    const phone = element.dataset.motionScene.startsWith('phone-');
    const hero = element.hasAttribute('data-hero-demo');
    const isCompact = compact.matches && !phone && !hero;
    const focus = element.dataset.focus || (isCompact ? element.dataset.mobileFocus : '') || '';
    const width = phone ? 390 : isCompact ? 520 : focus ? 900 : 1280;
    const height = phone ? 844 : hero ? 889 : isCompact ? 620 : focus ? 620 : 800;
    state.frame.style.width = `${width}px`;
    state.frame.style.height = `${height}px`;
    const scale = Math.min(element.clientWidth / width, element.clientHeight / height);
    state.frame.style.transform = `scale(${scale})`;
    const mode = `${isCompact}/${focus}`;
    if (state.mode === mode) return;
    state.mode = mode;
    state.ready = false;
    state.finished = false;
    state.command = '';
    element.classList.remove('is-ready');
    const source = new URL('./product-motion.html', location.href);
    source.searchParams.set('scene', element.dataset.motionScene);
    source.searchParams.set('lang', zh ? 'zh' : 'en');
    source.searchParams.set(
      'version',
      document.querySelector('[data-release-version]').textContent,
    );
    source.searchParams.set('once', '1');
    if (focus) source.searchParams.set('focus', focus);
    if (isCompact) source.searchParams.set('compact', '1');
    state.frame.src = source.href;
  }

  function mountMotion(element) {
    if (motions.has(element)) return;
    const frame = document.createElement('iframe');
    frame.title = element.getAttribute('aria-label');
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const state = { frame, ready: false, inView: false, finished: false };
    motions.set(element, state);
    element.append(frame);
    new ResizeObserver(() => configureMotion(element, state)).observe(element);
    configureMotion(element, state);
  }

  const motionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) mountMotion(entry.target);
        const state = motions.get(entry.target);
        if (state) state.inView = entry.isIntersecting;
      });
      syncMotions();
    },
    { threshold: 0.05 },
  );
  document
    .querySelectorAll('[data-motion-scene]')
    .forEach((element) => motionObserver.observe(element));

  addEventListener('message', (event) => {
    if (
      event.origin !== location.origin ||
      !['brevia-motion-ready', 'brevia-motion-ended'].includes(event.data?.type)
    )
      return;
    motions.forEach((state, element) => {
      if (event.source !== state.frame.contentWindow) return;
      if (event.data.type === 'brevia-motion-ended') {
        state.finished = true;
      } else {
        state.ready = true;
        state.command = '';
        configureMotion(element, state);
        const initial = Number(element.dataset.start || 1800);
        state.frame.contentWindow.postMessage(
          {
            type: 'brevia-motion-state',
            running: false,
            reduced: reducedMotion.matches,
            seek: initial,
          },
          location.origin,
        );
        element.classList.add('is-ready');
      }
    });
    syncMotions();
  });

  function updateScroll() {
    scheduled = false;
    header.classList.toggle('is-scrolled', scrollY > 8);
    const hero = document.querySelector('.hero-visual');
    const progress = clamp(
      (innerHeight * 0.85 - hero.getBoundingClientRect().top) / (innerHeight * 0.8),
    );
    hero.style.setProperty('--hero-progress', progress);
    const window = hero.querySelector('.hero-window');
    window.style.transform =
      compact.matches || reducedMotion.matches
        ? 'none'
        : `rotateX(${(1 - progress) * 2}deg) scale(${0.98 + progress * 0.02})`;
    document.querySelectorAll('.scene-visual').forEach((visual) => {
      const enter = clamp(
        (innerHeight - visual.getBoundingClientRect().top) / (innerHeight * 0.65),
      );
      visual.style.setProperty('--stage-enter', reducedMotion.matches ? 1 : enter);
    });
    const phones = document.querySelector('.phone-stage');
    const phoneProgress = clamp(
      (innerHeight - phones.getBoundingClientRect().top) / (innerHeight + phones.offsetHeight),
    );
    phones.style.setProperty(
      '--phone-shift',
      compact.matches || reducedMotion.matches ? '0px' : `${(phoneProgress - 0.5) * 40}px`,
    );
    const sections = [...document.querySelectorAll('[data-nav-section]')];
    let active = '';
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= header.offsetHeight + innerHeight * 0.35)
        active = section.id;
    });
    if (active === 'library') active = 'features';
    document.querySelectorAll('[data-section-link]').forEach((link) => {
      if (link.hash === `#${active}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  function requestScroll() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateScroll);
  }
  addEventListener('scroll', requestScroll, { passive: true });
  addEventListener('resize', requestScroll);
  reducedMotion.addEventListener('change', () => {
    requestScroll();
    syncMotions();
  });
  compact.addEventListener('change', () => {
    motions.forEach((state, element) => configureMotion(element, state));
    requestScroll();
  });
  document.addEventListener('visibilitychange', syncMotions);
  updateScroll();

  const software = document.querySelector('.software-section');
  let softwareVisible = false;
  function syncSoftware() {
    software.classList.toggle(
      'is-scrolling',
      softwareVisible && !document.hidden && !reducedMotion.matches,
    );
  }
  new IntersectionObserver(
    ([entry]) => {
      softwareVisible = entry.isIntersecting;
      syncSoftware();
    },
    { threshold: 0.05 },
  ).observe(software);
  document.addEventListener('visibilitychange', syncSoftware);
  reducedMotion.addEventListener('change', syncSoftware);
  syncSoftware();

  const flowObserver = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (!reducedMotion.matches) entry.target.classList.add('is-flow-entering');
        flowObserver.unobserve(entry.target);
      }),
    { threshold: 0.35 },
  );
  flowObserver.observe(document.querySelector('[data-flow-reveal]'));

  document.documentElement.classList.add('has-motion');

  const disclosures = [...document.querySelectorAll('.disclosure')];
  disclosures.forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open)
        disclosures.forEach((other) => {
          if (other !== details) other.open = false;
        });
    });
    details.querySelectorAll('a').forEach((link) =>
      link.addEventListener('click', () => {
        details.open = false;
      }),
    );
  });
  document.addEventListener('click', (event) => {
    disclosures.forEach((details) => {
      if (!details.contains(event.target)) details.open = false;
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    disclosures.forEach((details) => {
      if (!details.open) return;
      details.open = false;
      details.querySelector('summary').focus();
    });
  });
  document.querySelectorAll('[data-language]').forEach((link) => {
    if (link.dataset.language === (document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'))
      link.setAttribute('aria-current', 'page');
    // 浏览器禁止存储时，普通语言链接仍可正常导航。
    link.addEventListener('click', () => {
      try {
        sessionStorage.setItem('lang-selected', link.dataset.language);
      } catch {}
      link.hash = location.hash;
    });
  });
})();
