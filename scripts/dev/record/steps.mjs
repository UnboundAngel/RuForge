// Step runner shared by CLI flags and --script files.
import { readFileSync } from 'node:fs';
import { scrollBy, scrollTo } from './scroll.mjs';

const XY = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

export const STEP_KINDS = ['move', 'click', 'hover', 'type', 'key', 'scroll', 'scroll-to', 'wait', 'wait-for', 'eval', 'mark', 'drag', 'script'];

// Expands --script files in place so ordering with flag steps is preserved.
export function expandSteps(steps) {
  const out = [];
  for (const [kind, arg] of steps) {
    if (kind !== 'script') { out.push([kind, arg]); continue; }
    const list = JSON.parse(readFileSync(arg, 'utf8'));
    if (!Array.isArray(list)) throw new Error(`${arg} must be a JSON array of {step, arg}`);
    for (const s of list) {
      const k = String(s.step ?? '').replace(/^--/, '');
      if (!STEP_KINDS.includes(k) || k === 'script') throw new Error(`${arg}: unknown step "${s.step}"`);
      out.push([k, String(s.arg ?? '')]);
    }
  }
  return out;
}

export function createRunner({ page, cursor, marks, now }) {
  // Views stay mounted while hidden, so a bare selector often hits an invisible duplicate first.
  const visible = (css) => page.locator(css).filter({ visible: true }).first();

  async function point(arg) {
    const m = XY.exec(arg);
    if (m) return { x: Number(m[1]), y: Number(m[2]) };
    const loc = visible(arg);
    await loc.waitFor({ timeout: 10000 });
    const b = await loc.boundingBox();
    if (!b) throw new Error(`no box for ${arg}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  return async function run(kind, arg) {
    if (kind === 'move' || kind === 'hover') {
      const p = await point(arg);
      await cursor.moveTo(p.x, p.y);
    } else if (kind === 'click') {
      const p = await point(arg);
      await cursor.moveTo(p.x, p.y);
      await page.waitForTimeout(120);
      await cursor.click();
    } else if (kind === 'drag') {
      const [a, b] = arg.split('->').map((s) => s.trim());
      if (!a || !b) throw new Error('--drag needs <css>-><css>');
      const from = await point(a);
      const to = await point(b);
      await cursor.moveTo(from.x, from.y);
      await page.waitForTimeout(120);
      await cursor.press();
      // Small first nudge so drag libraries cross their activation distance before the long glide.
      await cursor.moveTo(from.x + (to.x >= from.x ? 6 : -6), from.y + (to.y >= from.y ? 6 : -6));
      await cursor.moveTo(to.x, to.y);
      await page.waitForTimeout(160);
      await cursor.release();
    } else if (kind === 'type') await page.keyboard.type(arg, { delay: 55 });
    else if (kind === 'key') await page.keyboard.press(arg);
    else if (kind === 'scroll') await scrollBy(page, cursor, arg);
    else if (kind === 'scroll-to') await scrollTo(page, cursor, arg);
    else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    else if (kind === 'wait-for') await visible(arg).waitFor({ timeout: 10000 });
    else if (kind === 'mark') marks[arg] = now();
    else if (kind === 'eval') {
      const result = await page.evaluate((src) => (0, eval)(src), arg);
      if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result));
    }
  };
}
