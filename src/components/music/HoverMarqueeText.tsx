import { useState } from "react";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  layoutKey?: boolean | number | string;
  /** Slower loop for long device / path labels. */
  slow?: boolean;
  /**
   * When set, parent owns hover (e.g. whole menu row). Omit for self-managed hover.
   */
  active?: boolean;
};

export function HoverMarqueeText({
  text,
  className = "",
  layoutKey,
  slow = false,
  active,
}: Props) {
  const [localHovered, setLocalHovered] = useState(false);
  const hovered = active ?? localHovered;
  const controlled = active !== undefined;

  return (
    <div
      className="min-w-0"
      onMouseEnter={controlled ? undefined : () => setLocalHovered(true)}
      onMouseLeave={controlled ? undefined : () => setLocalHovered(false)}
    >
      {hovered ? (
        <MarqueeText
          text={text}
          className={className}
          layoutKey={layoutKey}
          fadeLeadingEdge
          marqueeClassName={slow ? "animate-marquee-slow" : "animate-marquee"}
        />
      ) : (
        <div className={cn(className, "truncate")}>{text}</div>
      )}
    </div>
  );
}
