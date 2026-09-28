/** Engraved brass plaque under the frame. */
export function Plaque({ frame }: { frame: number }) {
  return (
    <div
      className="mu-brass absolute left-1/2 flex w-[34%] -translate-x-1/2 flex-col items-center rounded-[2px] px-[2cqw] py-[1.6cqw] shadow-[0_4px_8px_rgba(0,0,0,0.65),inset_0_0_0_1px_rgba(90,60,15,0.6),inset_0_0_0_3px_rgba(255,235,180,0.25)]"
      style={{ top: `calc(100% + ${frame + 14}px)` }}
    >
      <span className="absolute left-[4%] top-1/2 size-[0.9cqw] -translate-y-1/2 rounded-full bg-[#6d5220] shadow-[inset_0_1px_0_rgba(255,240,200,0.5)]" />
      <span className="absolute right-[4%] top-1/2 size-[0.9cqw] -translate-y-1/2 rounded-full bg-[#6d5220] shadow-[inset_0_1px_0_rgba(255,240,200,0.5)]" />
      <span className="mu-engrave text-[2.6cqw] font-semibold tracking-[0.28em]">NOW PLAYING</span>
      <span className="mu-engrave mt-[0.8cqw] text-[1.55cqw] italic tracking-[0.08em] opacity-85">
        Oil on vinyl, 33⅓ rpm
      </span>
    </div>
  );
}
