import { useEffect, useState } from "react";

type Props = {
  until: number;
  onCheckNow: () => void;
};

function formatWait(ms: number): string {
  const secs = Math.ceil(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export function CheckNowButton({ until, onCheckNow }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const cooling = now < until;

  useEffect(() => {
    setNow(Date.now());
    if (Date.now() >= until) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  return (
    <button
      type="button"
      disabled={cooling}
      onClick={onCheckNow}
      data-tooltip={cooling ? undefined : "Check every followed channel for new uploads"}
      className="text-[11px] font-semibold text-stone-400 tabular-nums transition-colors duration-150 hover:text-[color:var(--accent)] disabled:pointer-events-none disabled:text-stone-600"
    >
      {cooling ? `Check again in ${formatWait(until - now)}` : "Check now"}
    </button>
  );
}
