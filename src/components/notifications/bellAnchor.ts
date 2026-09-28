let bellEl: HTMLElement | null = null;

/** Ref callback for the title bar bell; the popover anchors to it and ignores pointerdowns on it. */
export function registerBellAnchor(el: HTMLElement | null): void {
  bellEl = el;
}

export function bellAnchorRect(): DOMRect | null {
  return bellEl?.getBoundingClientRect() ?? null;
}

export function isInsideBell(target: EventTarget | null): boolean {
  return !!bellEl && target instanceof Node && bellEl.contains(target);
}
