const HEADER_GAP_PX = 20;
const PRESS_FEEDBACK_MS = 140;

function fixedHeaderBottom(): number {
  let bottom = 0;
  for (const header of document.querySelectorAll('[data-rf-fixed-header]')) {
    const rect = header.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight / 3) bottom = Math.max(bottom, rect.bottom);
  }
  return bottom;
}

export function scrollToElement(el: Element): void {
  const top = el.getBoundingClientRect().top + window.scrollY - fixedHeaderBottom() - HEADER_GAP_PX;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
}

/** Same-page `#id` links scroll smoothly and stop below the fixed header instead of under it. */
export function initSmoothAnchors(): void {
  const w = window as Window & { __rfSmoothAnchors?: boolean };
  if (w.__rfSmoothAnchors) return;
  w.__rfSmoothAnchors = true;

  // Capture phase so this runs before ClientRouter's own link handling.
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href*="#"]') as HTMLAnchorElement | null;
      if (!link) return;
      const url = new URL(link.href, location.href);
      if (!url.hash || url.pathname !== location.pathname || url.search !== location.search) return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!target) return;

      event.preventDefault();
      history.replaceState(history.state, '', url.hash);
      const pressed = link.matches('.rf-m-btn, .rf-m-card, .rf-m-link');
      if (pressed) window.setTimeout(() => scrollToElement(target), PRESS_FEEDBACK_MS);
      else scrollToElement(target);
    },
    true,
  );
}
