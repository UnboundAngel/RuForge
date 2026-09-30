#!/usr/bin/env node
// Frames an app screenshot inside a hand-drawn /features step card template.
// Usage:
//   node frame-step-card.cjs --template <card.webp> --shot <screenshot> --out <out.webp> [--hue 110] [--sat 0.85] [--preview <out.png>]
//   node frame-step-card.cjs --probe <card.webp> [...more]
const path = require('path');
const repoRoot = path.resolve(__dirname, '../../../..');
const sharp = require(path.join(repoRoot, 'website/node_modules/sharp'));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const DARK = 90;
const LINE = Number(opt('line', 4));
const EDGE = 16;
const BG_PROBE = [256, 18];

async function load(file) {
  const img = sharp(file).removeAlpha();
  const { width, height } = await img.metadata();
  return { W: width, H: height, px: await img.raw().toBuffer() };
}

function hueAt({ W, px }, x, y) {
  const o = (y * W + x) * 3;
  const [r, g, b] = [px[o] / 255, px[o + 1] / 255, px[o + 2] / 255];
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// The hand-drawn outline wobbles, so scan each row/column from the card edge
// inward to the first dark stroke, then fall back to the median where a scan
// wanders more than 12px (gaps in the stroke).
function wellMask({ W, H, px }) {
  const lum = (x, y) => { const o = (y * W + x) * 3; return 0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2]; };
  const inner = (from, step, limit, get) => {
    let p = from;
    while (p !== limit && get(p) >= DARK) p += step;
    return p === limit ? -1 : p + step * LINE;
  };
  const band = Math.floor(H * 0.5);
  const left = new Int32Array(H).fill(-1), right = new Int32Array(H).fill(-1);
  for (let y = 0; y < band; y++) {
    left[y] = inner(10, 1, W >> 1, (x) => lum(x, y));
    right[y] = inner(W - 11, -1, W >> 1, (x) => lum(x, y));
  }
  const top = new Int32Array(W).fill(-1), bottom = new Int32Array(W).fill(-1);
  for (let x = 0; x < W; x++) {
    top[x] = inner(10, 1, band >> 1, (y) => lum(x, y));
    bottom[x] = inner(band - 1, -1, band >> 1, (y) => lum(x, y));
  }
  const med = (a) => { const v = [...a].filter((n) => n >= 0).sort((p, q) => p - q); return v[v.length >> 1]; };
  const pick = (v, m) => (v >= 0 && Math.abs(v - m) < 12 ? v : m);
  const mL = med(left), mR = med(right), mT = med(top), mB = med(bottom);
  const mask = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < band; y++) for (let x = 0; x < W; x++) {
    if (x >= pick(left[y], mL) && x <= pick(right[y], mR) && y >= pick(top[x], mT) && y <= pick(bottom[x], mB)) {
      mask[y * W + x] = 1;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  return { mask, x0, y0, bw: x1 - x0 + 1, bh: y1 - y0 + 1 };
}

async function frame() {
  const template = opt('template'), shot = opt('shot'), out = opt('out');
  if (!template || !shot || !out) throw new Error('need --template, --shot and --out');
  const tpl = await load(template);
  const { W, H } = tpl;
  const well = wellMask(tpl);
  console.log('well', { x0: well.x0, y0: well.y0, w: well.bw, h: well.bh });
  if (well.bw < W * 0.6 || well.bh < H * 0.25) throw new Error('well detection looks wrong, check the preview or tune --line');

  let base = tpl.px;
  const hue = opt('hue');
  if (hue !== undefined) {
    const from = hueAt(tpl, ...BG_PROBE);
    const shift = Math.round((Number(hue) - from + 360) % 360);
    console.log('backing hue', Math.round(from), 'shift', shift);
    base = await sharp(template).removeAlpha()
      .modulate({ hue: shift, saturation: Number(opt('sat', 0.85)) })
      .raw().toBuffer();
    // Keep the brown outer border: only dark pixels where r >= g >= b count as
    // brown, so pink backing near the edge still gets recolored.
    const src = tpl.px;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x >= EDGE && y >= EDGE && x < W - EDGE && y < H - EDGE) continue;
      const q = (y * W + x) * 3;
      const l = 0.3 * src[q] + 0.59 * src[q + 1] + 0.11 * src[q + 2];
      if (l < 165 && src[q] >= src[q + 1] && src[q + 1] + 6 >= src[q + 2]) {
        base[q] = src[q]; base[q + 1] = src[q + 1]; base[q + 2] = src[q + 2];
      }
    }
  }

  const meta = await sharp(shot).metadata();
  const shotRatio = meta.width / meta.height, wellRatio = well.bw / well.bh;
  if (Math.abs(shotRatio - wellRatio) / wellRatio > 0.05) {
    console.warn(`warning: shot is ${shotRatio.toFixed(2)}:1 but the well is ${wellRatio.toFixed(2)}:1, the shot will be cropped. Use a template with a matching well.`);
  }

  const fitted = await sharp(shot).resize(well.bw, well.bh, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(well.bw * well.bh * 4);
  for (let y = 0; y < well.bh; y++) for (let x = 0; x < well.bw; x++) {
    const p = y * well.bw + x;
    rgba[p * 4] = fitted[p * 3]; rgba[p * 4 + 1] = fitted[p * 3 + 1]; rgba[p * 4 + 2] = fitted[p * 3 + 2];
    rgba[p * 4 + 3] = well.mask[(y + well.y0) * W + (x + well.x0)] ? 255 : 0;
  }
  const rgb = await sharp(base, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: rgba, raw: { width: well.bw, height: well.bh, channels: 4 }, left: well.x0, top: well.y0 }])
    .removeAlpha()
    .raw()
    .toBuffer();
  // The templates have transparent rounded corners; carry that alpha through or the corners go solid.
  const alpha = await sharp(template).ensureAlpha().extractChannel(3).raw().toBuffer();
  const outPx = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    outPx[p * 4] = rgb[p * 3]; outPx[p * 4 + 1] = rgb[p * 3 + 1]; outPx[p * 4 + 2] = rgb[p * 3 + 2];
    outPx[p * 4 + 3] = alpha[p];
  }
  await sharp(outPx, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(out);
  const preview = opt('preview');
  if (preview) await sharp(out).png().toFile(preview);
  console.log('wrote', out);
}

async function probe() {
  for (const file of args.filter((a) => a !== '--probe')) {
    const img = await load(file);
    const o = (BG_PROBE[1] * img.W + BG_PROBE[0]) * 3;
    console.log(path.basename(file), `${img.W}x${img.H}`, 'hue', Math.round(hueAt(img, ...BG_PROBE)), 'rgb', img.px[o], img.px[o + 1], img.px[o + 2]);
  }
}

(args.includes('--probe') ? probe() : frame()).catch((e) => { console.error(e.message); process.exit(1); });
