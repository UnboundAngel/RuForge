import { ListVideo, MoreHorizontal } from "lucide-react";

/** Empty playlist thumb — muted plate + list mark (YouTube-style empty, not a branded cover). */
export function PlaylistEmptyThumb({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center bg-[#2c2622] ${className}`}
      aria-hidden
    >
      <div className="w-14 h-11 rounded-lg bg-[#3a332e] border border-white/[0.06] flex items-center justify-center">
        <MoreHorizontal size={22} strokeWidth={2} className="text-[#6b635c]" />
      </div>
      <ListVideo
        size={14}
        strokeWidth={2}
        className="absolute bottom-3 right-3 text-white/35"
      />
    </div>
  );
}
