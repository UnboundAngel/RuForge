// Screenshots and light driving of the real running dev app over WebView2 CDP.
// Start the app with `npm run dev:app:debug`. Usage: see root AGENTS.md "Screenshots of the app".
import { mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Steps run in the order given; everything else in VALUE is a single option.
const STEP = new Set(['--eval', '--hover', '--click', '--key', '--wait', '--wait-for']);
const VALUE = new Set([...STEP, '--selector', '--settle', '--page', '--port']);

function parseArgs(argv) {
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

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const opts = parseArgs(process.argv.slice(2));
const port = opts.port ?? process.env.RUFORGE_CDP_PORT ?? '9222';
const settle = Number(opts.settle ?? 300);

let browser;
try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 });
} catch {
  fail(`RuForge dev app not reachable on 127.0.0.1:${port}. Start it with: npm run dev:app:debug`);
}

const pages = browser.contexts().flatMap((c) => c.pages());

if (opts.flags.has('--list')) {
  for (const [i, p] of pages.entries()) console.log(`${i}\t${await p.title()}\t${p.url()}`);
  process.exit(0);
}

// The main window serves the Vite root with no rfWindow param; the Explorer webview shows external sites.
const SECONDARY = /explorer|island|music-mini|companion|rfWindow=/i;
const APP = /^(https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)[:/]|tauri:)/i;
const page = opts.page
  ? pages.find((p) => p.url().includes(opts.page) || false)
  : pages.find((p) => APP.test(p.url()) && !SECONDARY.test(p.url())) ?? pages[0];
if (!page) fail(`no page matches ${opts.page ?? '(main)'}. Run with --list`);

try {
  // Views stay mounted while hidden, so a bare selector often hits an invisible duplicate first.
  const visible = (css) => page.locator(css).filter({ visible: true }).first();
  for (const [kind, arg] of opts.steps) {
    if (kind === 'eval') {
      // Print the result so agents never throw just to read a value back.
      const result = await page.evaluate((src) => (0, eval)(src), arg);
      if (result !== undefined) console.log(typeof result === 'string' ? result : JSON.stringify(result));
    } else if (kind === 'hover') await visible(arg).hover({ timeout: 5000 });
    else if (kind === 'click') await visible(arg).click({ timeout: 5000 });
    else if (kind === 'key') await page.keyboard.press(arg);
    else if (kind === 'wait') await page.waitForTimeout(Number(arg));
    else if (kind === 'wait-for') await visible(arg).waitFor({ timeout: 10000 });
  }
  if (opts.flags.has('--state')) {
    console.log(JSON.stringify(await page.evaluate(() => ({ url: location.href, title: document.title, hash: location.hash })), null, 2));
  }
  if (opts.name) {
    await page.waitForTimeout(settle);
    const out = join(repoRoot, '.screenshots', `${opts.name}.png`);
    mkdirSync(dirname(out), { recursive: true });
    // The app keeps zero-size duplicates (e.g. a hidden brand h1), so target the first visible match.
    if (opts.selector) await page.locator(opts.selector).filter({ visible: true }).first().screenshot({ path: out, timeout: 5000 });
    else await page.screenshot({ path: out });
    console.log(relative(repoRoot, out).replaceAll('\\', '/'));
  } else if (!opts.flags.has('--state') && !opts.steps.length) {
    fail('usage: node scripts/dev/shot.mjs <name> [--selector css] [--eval js]... [--hover css] [--click css] [--key k] [--wait ms] [--wait-for css] [--settle ms] [--page substr] [--port n] | --list | --state');
  }
} catch (e) {
  fail(`shot failed: ${e.message.split('\n')[0]}`);
}

// No browser.close(): exiting drops the CDP socket and leaves the app running.
process.exit(0);
