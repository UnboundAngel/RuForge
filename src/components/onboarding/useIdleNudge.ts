import { useEffect, useRef } from "react";

const PULSE_AFTER_MS = 15_000;
const EXPAND_AFTER_MS = 35_000;

/**
 * A collapsed pill nudges a stuck user once per beat: a pulse, then a re-expand.
 * `resetSignal` changing (progress made) restarts the clock without re-arming fired nudges.
 */
export function useIdleNudge({
  enabled,
  phaseKey,
  resetSignal,
  onPulse,
  onExpand,
}: {
  enabled: boolean;
  phaseKey: string;
  resetSignal: unknown;
  onPulse: () => void;
  onExpand: () => void;
}): void {
  const fired = useRef({ key: "", pulsed: false, expanded: false });
  const pulseRef = useRef(onPulse);
  const expandRef = useRef(onExpand);
  pulseRef.current = onPulse;
  expandRef.current = onExpand;

  useEffect(() => {
    if (fired.current.key !== phaseKey) {
      fired.current = { key: phaseKey, pulsed: false, expanded: false };
    }
    if (!enabled) return;
    const state = fired.current;
    const timers: number[] = [];
    if (!state.pulsed) {
      timers.push(
        window.setTimeout(() => {
          state.pulsed = true;
          pulseRef.current();
        }, PULSE_AFTER_MS),
      );
    }
    if (!state.expanded) {
      timers.push(
        window.setTimeout(() => {
          state.expanded = true;
          expandRef.current();
        }, EXPAND_AFTER_MS),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [enabled, phaseKey, resetSignal]);
}
