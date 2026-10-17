import { Fragment, useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatDescriptionMeta, isDividerLine, linkDisplayText, segmentDescription, splitChapterLine } from "@/lib/videoDescription";

type DescriptionTextProps = {
  text: string | null;
  loading?: boolean;
  durationSec?: number;
  onSeek: (seconds: number) => void;
  compact?: boolean;
  viewCount?: number | null;
  uploadDate?: string | null;
};

type Block =
  | { kind: "text"; line: string }
  | { kind: "chapters"; rows: { time: string; seconds: number; title: string }[] };

function buildBlocks(text: string, durationSec?: number): Block[] {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const ch = splitChapterLine(line, durationSec);
    const prev = blocks[blocks.length - 1];
    if (ch && prev?.kind === "chapters") prev.rows.push(ch);
    else if (ch) blocks.push({ kind: "chapters", rows: [ch] });
    else blocks.push({ kind: "text", line });
  }
  return blocks;
}

const ACCENT_TIME = "font-semibold tabular-nums text-[color:var(--accent)]";

export function DescriptionText({ text, loading = false, durationSec, onSeek, compact = false, viewCount, uploadDate }: DescriptionTextProps) {
  const blocks = useMemo(() => (text ? buildBlocks(text, durationSec) : []), [text, durationSec]);
  const size = compact ? "text-[12.5px] leading-[1.4]" : "text-[14px] leading-[1.4]";
  const meta = formatDescriptionMeta(viewCount, uploadDate);

  if (loading) return null;
  if (!text && !meta) {
    return (
      <p className={`${size} py-6 text-white/45`}>No description saved for this video.</p>
    );
  }

  return (
    <div className={`${size} text-white/90 [overflow-wrap:anywhere]`}>
      {meta && <div className="mb-2 whitespace-pre-wrap font-bold text-white">{meta}</div>}
      {!text && <p className="py-2 text-white/45">No description saved for this video.</p>}
      {blocks.map((block, bi) => {
        if (block.kind === "chapters") {
          const timeWidth = Math.max(...block.rows.map((r) => r.time.length));
          return (
            <div key={bi}>
              {block.rows.map((row, ri) => (
                <button
                  key={ri}
                  type="button"
                  onClick={() => onSeek(row.seconds)}
                  className="group flex w-full cursor-pointer items-baseline gap-3 border-none bg-transparent p-0 text-left font-[inherit] text-inherit outline-none"
                >
                  <span
                    className={`${ACCENT_TIME} shrink-0 group-hover:underline`}
                    style={{ width: `${timeWidth}ch` }}
                  >
                    {row.time}
                  </span>
                  <span className="min-w-0">{row.title}</span>
                </button>
              ))}
            </div>
          );
        }
        if (isDividerLine(block.line)) {
          return (
            <div key={bi} className="min-h-[1lh] overflow-hidden whitespace-nowrap text-white/30">
              {block.line.trim()}
            </div>
          );
        }
        return (
          <div key={bi} className="min-h-[1lh] whitespace-pre-wrap">
            {segmentDescription(block.line, durationSec).map((seg, i) => {
              if (seg.kind === "url") {
                return (
                  <a
                    key={i}
                    href={seg.url}
                    onClick={(e) => {
                      e.preventDefault();
                      void openUrl(seg.url).catch((err) => console.warn("open link failed", err));
                    }}
                    className="cursor-pointer font-normal text-[color:var(--accent)] no-underline hover:underline"
                  >
                    {linkDisplayText(seg.url)}
                  </a>
                );
              }
              if (seg.kind === "timestamp") {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onSeek(seg.seconds)}
                    className={`${ACCENT_TIME} cursor-pointer border-none bg-transparent p-0 font-[inherit] outline-none hover:underline`}
                  >
                    {seg.text}
                  </button>
                );
              }
              return <Fragment key={i}>{seg.text}</Fragment>;
            })}
          </div>
        );
      })}
    </div>
  );
}
