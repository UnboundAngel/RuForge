/** Kept bare on purpose: cool window light on the jacket and a soft shadow onto the sky. */
export default function LofiOrnaments() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      <div className="absolute inset-0 rounded-[10px] shadow-[0_24px_50px_rgba(8,6,30,0.7)]" />
      <div
        className="absolute inset-0 rounded-[10px] mix-blend-soft-light"
        style={{ background: "linear-gradient(200deg, rgb(190 180 255 / 0.45), transparent 50%)" }}
      />
      <div className="absolute inset-0 rounded-[10px] shadow-[inset_0_2px_0_rgba(210,200,255,0.3)]" />
    </div>
  );
}
