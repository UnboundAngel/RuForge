/** Outer window corner radius when not maximized. */
export const MAIN_WINDOW_OUTER_RADIUS_PX = 12;

export function mainWindowPortalRoot(): HTMLElement {
  return document.getElementById("root") ?? document.body;
}

export function syncMainWindowTransparentFrame(rounded: boolean): void {
  document.documentElement.dataset.rfWindowRounded = rounded ? "1" : "0";

  const html = document.documentElement;
  const body = document.body;
  const root = document.getElementById("root");

  if (rounded) {
    html.style.background = "transparent";
    body.style.background = "transparent";
    if (root) root.style.background = "transparent";
    return;
  }

  html.style.background = "";
  body.style.background = "";
  if (root) root.style.background = "";
}
