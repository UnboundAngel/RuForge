const BOOT_ID = "rf-boot";
const OUT_CLASS = "rf-boot--out";
const HIDDEN_CLASS = "rf-boot--hidden";
const PREVIEW_ATTR = "preview";
/** sessionStorage: one splash per app session; survives dev refresh, clears on quit. */
export const BOOT_SEEN_SESSION_KEY = "rf-boot-seen";

const BOOT_INNER_HTML = `
  <div class="rf-boot__layer rf-boot__layer--default"></div>
  <div class="rf-boot__layer rf-boot__layer--music"></div>
  <div class="rf-boot__siri-glow">
    <div class="rf-boot__siri-orb rf-boot__siri-orb--1"></div>
    <div class="rf-boot__siri-orb rf-boot__siri-orb--2"></div>
    <div class="rf-boot__siri-orb rf-boot__siri-orb--3"></div>
    <div class="rf-boot__siri-orb rf-boot__siri-orb--4"></div>
  </div>
  <div class="rf-boot__container" role="status" aria-live="polite" aria-label="Loading RuForge">
    <h1 class="rf-boot__title">RuForge</h1>
  </div>
`;

let previewClickHandler: ((event: MouseEvent) => void) | null = null;

function getBootEl(): HTMLElement | null {
  return document.getElementById(BOOT_ID);
}

function ensureBootEl(): HTMLElement {
  let el = getBootEl();
  if (el) return el;

  el = document.createElement("div");
  el.id = BOOT_ID;
  el.dataset.mode = "default";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = BOOT_INNER_HTML;

  const root = document.getElementById("root");
  if (root?.parentNode) {
    root.parentNode.insertBefore(el, root);
  } else {
    document.body.prepend(el);
  }

  return el;
}

function detachPreviewClickHandler(): void {
  const el = getBootEl();
  if (el && previewClickHandler) {
    el.removeEventListener("click", previewClickHandler);
  }
  previewClickHandler = null;
}

export function isBootSplashSkipped(): boolean {
  return document.documentElement.dataset.bootSkip === "1";
}

export function isBootSplashPreview(): boolean {
  return getBootEl()?.dataset[PREVIEW_ATTR] === "1";
}

export function readBootNavMode(): "default" | "music" {
  try {
    return localStorage.getItem("ruforge-nav-mode") === "music" ? "music" : "default";
  } catch {
    return "default";
  }
}

export function syncBootNavMode(): void {
  const el = getBootEl();
  if (!el) return;
  el.dataset.mode = readBootNavMode();
}

export function hideBootSplashImmediate(): void {
  const el = getBootEl();
  if (!el) return;
  detachPreviewClickHandler();
  delete el.dataset[PREVIEW_ATTR];
  el.classList.remove(OUT_CLASS);
  el.classList.add(HIDDEN_CLASS);
  el.setAttribute("aria-hidden", "true");
}

export function dismissBootSplash(): void {
  if (!isBootSplashPreview() && isBootSplashSkipped()) return;

  const el = getBootEl();
  if (!el || el.classList.contains(OUT_CLASS)) return;

  detachPreviewClickHandler();
  delete el.dataset[PREVIEW_ATTR];
  el.classList.add(OUT_CLASS);
  el.setAttribute("aria-hidden", "true");

  window.setTimeout(() => {
    el.classList.remove(OUT_CLASS);
    el.classList.add(HIDDEN_CLASS);
  }, 480);
}

export function showBootSplashPreview(): void {
  const el = ensureBootEl();
  detachPreviewClickHandler();

  el.classList.remove(HIDDEN_CLASS, OUT_CLASS);
  el.dataset[PREVIEW_ATTR] = "1";
  el.dataset.mode = readBootNavMode();
  el.setAttribute("aria-hidden", "false");

  previewClickHandler = () => {
    dismissBootSplash();
  };
  el.addEventListener("click", previewClickHandler);
}
