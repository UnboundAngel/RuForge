const FLASH_MS = 2200;

/** Smooth-scroll "On this page" links, mark the section in view, and highlight the heading you land on. */
export function initDocsToc(headerOffset: number): () => void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const sections = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((el): el is HTMLElement => el !== null);
  if (sections.length === 0) return () => {};

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lockedId: string | null = null;
  let unlockTimer = 0;
  let flashTimer = 0;
  let flashed: HTMLElement | null = null;

  const setActive = (id: string) => {
    links.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const flash = (target: HTMLElement) => {
    window.clearTimeout(flashTimer);
    flashed?.classList.remove('rf-section-flash');
    flashed = target;
    target.classList.add('rf-section-flash');
    flashTimer = window.setTimeout(() => target.classList.remove('rf-section-flash'), FLASH_MS);
  };

  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-toc-link]');
    if (!link) return;
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    const more = target.querySelector<HTMLButtonElement>(':scope > [data-disclosure][aria-expanded="false"]');
    more?.click();
    lockedId = target.id;
    window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => (lockedId = null), 1000);
    history.replaceState(history.state, '', link.hash);
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    setActive(target.id);
    flash(target);
  };

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (lockedId) return;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top - headerOffset <= 8) current = section;
      }
      setActive(current.id);
    });
  };

  // Capture phase: Astro's ClientRouter also handles hash links on document and jumps instantly.
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  return () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll);
    window.clearTimeout(flashTimer);
  };
}

/** Fill `[data-read-progress]` with how far down the page the reader is. */
export function initReadingProgress(): () => void {
  const bar = document.querySelector<HTMLElement>('[data-read-progress]');
  if (!bar) return () => {};

  let frame = 0;
  const update = () => {
    frame = 0;
    const travel = document.documentElement.scrollHeight - window.innerHeight;
    const progress = travel <= 0 ? 0 : Math.min(1, Math.max(0, window.scrollY / travel));
    bar.style.transform = `scaleX(${progress})`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  // Expanding or collapsing a card changes the page height without a scroll event.
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(document.body);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  return () => {
    resizeObserver.disconnect();
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
  };
}
