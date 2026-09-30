/** Smooth-scroll "On this page" links, mark the section in view, and flash the target heading. */
export function initDocsToc(headerOffset: number): () => void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')];
  const sections = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((el): el is HTMLElement => el !== null);
  if (sections.length === 0) return () => {};

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lockedId: string | null = null;
  let unlockTimer = 0;

  const setActive = (id: string) => {
    links.forEach((link) => {
      if (link.hash === `#${id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('[data-toc-link]');
    if (!link) return;
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    lockedId = target.id;
    window.clearTimeout(unlockTimer);
    unlockTimer = window.setTimeout(() => (lockedId = null), 900);
    history.replaceState(history.state, '', link.hash);
    const top = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    setActive(target.id);
    target.classList.remove('rf-section-flash');
    void target.offsetWidth;
    target.classList.add('rf-section-flash');
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
  };
}
