import { useCallback, useRef, useEffect } from 'react';

type HapticInstance = typeof import('@mxerf/tappt').haptic;

let _haptic: HapticInstance | null = null;
let _loading = false;
const _queue: ((h: HapticInstance) => void)[] = [];

function getHaptic(cb: (h: HapticInstance) => void) {
  if (_haptic) { cb(_haptic); return; }
  _queue.push(cb);
  if (_loading) return;
  _loading = true;
  import('@mxerf/tappt').then(({ haptic }) => {
    _haptic = haptic;
    _queue.forEach((fn) => fn(haptic));
    _queue.length = 0;
  });
}

export function useHaptic() {
  const ref = useRef<HapticInstance | null>(null);

  useEffect(() => {
    getHaptic((h) => { ref.current = h; });
  }, []);

  const tap = useCallback(() => {
    ref.current?.impact('light');
  }, []);

  const press = useCallback(() => {
    ref.current?.impact('medium');
  }, []);

  const select = useCallback(() => {
    ref.current?.selection();
  }, []);

  return { tap, press, select };
}
