import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

/** One line that scrolls to its end and back when it does not fit, like the Spotify track title. */
export function MarqueeText({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    const content = inner.current;
    if (!el || !content) return;
    const measure = () => setShift(Math.max(0, Math.ceil(content.offsetWidth - el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const style = shift > 0
    ? ({ "--shift": `${shift}px`, "--dur": `${Math.max(6, shift / 24 + 4)}s` } as CSSProperties)
    : undefined;

  return (
    <span ref={box} className={`ph-marquee${shift > 0 ? " ph-marquee--run" : ""}${className ? ` ${className}` : ""}`} style={style}>
      <span ref={inner} className="ph-marquee-in">{text}</span>
    </span>
  );
}
