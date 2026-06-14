type AltKeyIconProps = {
  className?: string;
};

export function AltKeyIcon({ className = "h-5 w-9" }: AltKeyIconProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/10 text-[10px] font-bold uppercase tracking-wide text-stone-200 ${className}`}
      aria-hidden
    >
      Alt
    </span>
  );
}
