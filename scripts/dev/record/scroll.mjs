// Scroll steps via real wheel events at the pointer, so the in-app smooth wheel does the easing.

// Runs in the page: the element's center and how far its scroller must move to center it.
function locate({ css }) {
  const el = [...document.querySelectorAll(css)].find((n) => n.getClientRects().length > 0);
  if (!el) return null;
  let sc = el;
  while (sc && sc !== document.body && !(/auto|scroll|overlay/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 1)) {
    sc = sc.parentElement;
  }
  const r = el.getBoundingClientRect();
  const view = sc && sc !== document.body ? sc.getBoundingClientRect() : { top: 0, height: innerHeight };
  return { x: r.left + r.width / 2, y: Math.min(Math.max(r.top + r.height / 2, view.top + 4), view.top + view.height - 4), dy: r.top + r.height / 2 - (view.top + view.height / 2) };
}

async function locateOrThrow(page, css) {
  const where = await page.evaluate(locate, { css });
  if (!where) throw new Error(`no visible match for ${css}`);
  return where;
}

// `--scroll <css>:<dy>[:ms]`; the selector may itself contain colons, so split from the right.
export async function scrollBy(page, mouse, arg) {
  const parts = arg.split(':');
  let ms = 500;
  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1)) && /^-?\d+(\.\d+)?$/.test(parts.at(-2))) ms = Number(parts.pop());
  const dy = Number(parts.pop());
  if (!Number.isFinite(dy)) throw new Error(`--scroll needs <css>:<dy>[:ms], got ${arg}`);
  const where = await locateOrThrow(page, parts.join(':'));
  await mouse.moveTo(where.x, where.y);
  await mouse.wheel(dy, ms);
}

export async function scrollTo(page, mouse, css) {
  const where = await locateOrThrow(page, css);
  await mouse.moveTo(where.x, where.y);
  if (Math.abs(where.dy) > 8) await mouse.wheel(where.dy, 400);
}
