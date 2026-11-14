/**
 * Index of every stylesheet rule that declares `cursor`, so the shown cursor can be worked out
 * with `matches()` instead of getComputedStyle. Reading computed style while our own `cursor: none`
 * rule is active would mean lifting it, and that restyles the whole document on every read.
 */

type Rule = { sel: string; value: string; important: boolean };

let rules: Rule[] = [];
let dirty = true;
let watching = false;

function collect(list: CSSRuleList, out: Rule[]) {
  for (const rule of Array.from(list)) {
    if (rule instanceof CSSStyleRule) {
      const value = rule.style.getPropertyValue("cursor").trim();
      // Nested selectors start from `&` and cannot be matched on their own; our own hide rule must not count.
      if (value && !rule.selectorText.includes("&") && !rule.selectorText.includes("rf-recording")) {
        out.push({ sel: rule.selectorText, value, important: rule.style.getPropertyPriority("cursor") === "important" });
      }
    }
    const inner = (rule as { cssRules?: CSSRuleList }).cssRules;
    if (inner) collect(inner, out);
  }
}

function rebuild() {
  const next: Rule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collect(sheet.cssRules, next);
    } catch {
      /* cross-origin sheet */
    }
  }
  rules = next;
  dirty = false;
}

/** Vite HMR swaps style tags, so any head mutation marks the index stale; it rebuilds on the next read. */
function watch() {
  if (watching) return;
  watching = true;
  new MutationObserver(() => {
    dirty = true;
  }).observe(document.head, { childList: true, subtree: true, characterData: true });
}

/** The cursor value declared on this element itself, or null. Specificity is approximated by source order. */
function declared(el: Element): string | null {
  const inline = (el as HTMLElement).style?.cursor;
  if (inline) return inline;
  let hit: Rule | null = null;
  for (const r of rules) {
    if (hit?.important && !r.important) continue;
    let ok = false;
    try {
      ok = el.matches(r.sel);
    } catch {
      ok = false;
    }
    if (ok) hit = r;
  }
  return hit ? hit.value : null;
}

/** Cursor value that applies to `el` (declared on it or the nearest ancestor), or "auto". */
export function effectiveCursor(el: Element | null): string {
  if (dirty) rebuild();
  watch();
  for (let n = el; n; n = n.parentElement) {
    const v = declared(n);
    if (v && v !== "inherit" && v !== "initial" && v !== "unset") return v;
  }
  return "auto";
}
