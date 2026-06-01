import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { rawArtistFromFile } from "@/components/music/musicArtist";
import type { MediaFile } from "@/types";
import type { CoverLayer } from "./useMusicMiniPlayback";

function trackTitle(file: MediaFile): string {
  if (file.name.includes(" - ")) {
    return file.name.split(" - ").slice(1).join(" - ").trim();
  }
  return file.name;
}

function MarqueeTitle({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        setOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth + 2);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={cn("w-full max-w-[280px] overflow-hidden leading-tight mt-1", overflowing && "rf-mm-fade-edges")}
    >
      <div className={cn("flex whitespace-nowrap", overflowing ? "w-max rf-mm-marquee" : "w-full justify-center")}>
        <span ref={textRef} className={cn("inline-block", overflowing && "pr-12", className)}>
          {text}
        </span>
        {overflowing && <span className={cn("inline-block pr-12", className)}>{text}</span>}
      </div>
    </div>
  );
}

export function MusicMiniTrackInfo({ layers }: { layers: CoverLayer[] }) {
  return (
    <div className="relative w-full h-[64px] flex justify-center items-center overflow-hidden px-8 mb-4">
      {layers.map((l, i) => {
        const isNewest = i === layers.length - 1;
        const dx = l.dir === "next" ? 14 : l.dir === "prev" ? -14 : 0;
        const exitDx = -dx;
        const state = isNewest ? (l.dir ? "rf-mm-ti-enter" : "") : "rf-mm-ti-exit";
        const style = { ["--dx" as string]: `${isNewest ? dx : exitDx}px` } as CSSProperties;
        const artist = rawArtistFromFile(l.file);
        const title = trackTitle(l.file);
        return (
          <div
            key={l.id}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center text-center",
              !isNewest && "pointer-events-none",
            )}
          >
            <p className={cn("text-[11px] font-medium tracking-[0.2em] uppercase", state)} style={style}>
              {artist || "Unknown Artist"}
            </p>
            <div className={cn("w-full flex justify-center", state)} style={style}>
              <MarqueeTitle
                text={title}
                className="text-white text-[24px] font-semibold tracking-tight"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
