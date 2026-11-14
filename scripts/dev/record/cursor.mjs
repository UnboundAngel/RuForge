// Drives the real mouse in eased steps. The visible cursor is the app's Recording mode
// (src/components/recording-mode), which follows the real pointer, so nothing is injected here.

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const MODE_EVENT = 'ruforge-recording-mode';

export async function isModeOn(page) {
  return page.evaluate(() => document.documentElement.classList.contains('rf-recording'));
}

export function setMode(page, on) {
  return page.evaluate(([name, v]) => window.dispatchEvent(new CustomEvent(name, { detail: v })), [MODE_EVENT, on]);
}

export class Mouse {
  constructor(page, start = null) {
    this.page = page;
    this.pos = start;
    this.flip = 1;
  }

  async init() {
    if (this.pos) await this.page.mouse.move(this.pos.x, this.pos.y);
  }

  // Quadratic bezier with a sideways bow, eased in and out; time-based so slow ticks do not stretch it.
  async moveTo(x, y) {
    let from = this.pos;
    if (!from) {
      from = { x: Math.max(8, x - 140), y: Math.max(8, y - 80) };
      await this.page.mouse.move(from.x, from.y);
      await this.page.waitForTimeout(220);
    }
    const dx = x - from.x;
    const dy = y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const ms = Math.min(900, Math.max(350, 300 + dist * 0.7));
    const bow = dist * 0.12 * this.flip;
    this.flip = -this.flip;
    const cx = from.x + dx / 2 + (-dy / dist) * bow;
    const cy = from.y + dy / 2 + (dx / dist) * bow;
    const t0 = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - t0) / ms);
      const e = ease(t);
      const u = 1 - e;
      await this.page.mouse.move(u * u * from.x + 2 * u * e * cx + e * e * x, u * u * from.y + 2 * u * e * cy + e * e * y);
      if (t >= 1) break;
      await this.page.waitForTimeout(4);
    }
    this.pos = { x, y };
  }

  async press() {
    await this.page.mouse.down();
    await this.page.waitForTimeout(110);
  }

  release() {
    return this.page.mouse.up();
  }

  async click() {
    await this.press();
    await this.release();
  }

  // Notch-sized wheel events at the pointer; the app's smooth wheel turns them into a glide.
  async wheel(dy, ms) {
    const notches = Math.max(1, Math.round(Math.abs(dy) / 100));
    const gap = Math.max(16, ms / notches);
    for (let i = 0; i < notches; i++) {
      await this.page.mouse.wheel(0, Math.sign(dy) * (Math.abs(dy) / notches));
      await this.page.waitForTimeout(gap);
    }
    await this.page.waitForTimeout(450);
  }
}
