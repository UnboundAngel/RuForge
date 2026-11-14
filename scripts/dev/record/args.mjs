// CLI parsing and help text for record.mjs.
import { STEP_KINDS } from './steps.mjs';

export const HELP = `Record a demo clip of the real running app (CDP screencast -> constant-fps mp4).
Start the app with: npm run dev:app:debug

usage: node scripts/dev/record.mjs <name> [options] [steps...]

Steps (run in order, repeatable):
  --move <css|x,y>        glide the mouse; the app's Recording mode draws the cursor (real mouse, so hover fires)
  --hover <css>           same as --move to an element
  --click <css|x,y>       move, then press/release with a ring
  --drag <css>-><css>     press, glide, release (reorder demos)
  --type <text>           type with a human delay
  --key <k>               Playwright key, e.g. Escape, Control+K
  --scroll <css>:<dy>[:ms]  real wheel notches over <css>; Recording mode eases them
  --scroll-to <css>       wheel until <css> is centered in its scroller
  --wait <ms>  --wait-for <css>  --eval <js>
  --mark <name>           timestamp into <name>.marks.json
  --script <file.json>    array of {"step": "click", "arg": ".x"}; see record/examples/

Options:
  --out <dir>             default .screenshots (gitignored); e.g. src/assets/whats-new
  --fps <n>               default 60
  --scale <f> | --width <px>   output size (even-rounded)
  --crf <n>               default 20
  --lead <ms> (400)  --tail <ms> (600)
  --trim-start <mark>  --trim-end <mark>
  --poster-mark <mark>    poster frame (default: first frame)
  --cursor-start x,y      show the cursor there from the start (else hidden until first move)
  --no-cursor             do not enable the app's Recording mode (no fake cursor, no eased wheel)
  --ffmpeg <path>         else FFMPEG env, PATH, the app's downloaded ffmpeg
  --keep-frames           keep the temp jpeg folder
  --page <substr>  --port <n>   as in shot.mjs (port default RUFORGE_CDP_PORT or 9222)

Writes <name>.mp4, <name>-poster.webp, <name>.marks.json.`;

const STEP = new Set(STEP_KINDS.map((k) => `--${k}`));
const VALUE = new Set([
  ...STEP, '--out', '--fps', '--scale', '--width', '--crf', '--lead', '--tail', '--trim-start', '--trim-end',
  '--poster-mark', '--cursor-start', '--ffmpeg', '--page', '--port',
]);

export function fail(msg) {
  console.error(msg);
  process.exit(1);
}

export function parseArgs(argv) {
  const opts = { name: null, steps: [], flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE.has(a)) {
      const v = argv[++i];
      if (v === undefined) fail(`${a} needs a value`);
      if (STEP.has(a)) opts.steps.push([a.slice(2), v]);
      else opts[a.slice(2)] = v;
    } else if (a.startsWith('--')) opts.flags.add(a);
    else if (!opts.name) opts.name = a;
    else fail(`unexpected argument ${a}`);
  }
  return opts;
}
