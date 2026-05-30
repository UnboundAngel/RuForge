import { useState } from "react";
import { MarqueeText } from "@/components/downloader/DownloadJobQueuePanel";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  layoutKey?: boolean | number | string;
};

export function HoverMarqueeText({ text, className = "", layoutKey }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered ? (
        <MarqueeText text={text} className={className} layoutKey={layoutKey} />
      ) : (
        <div className={cn(className, "truncate")}>{text}</div>
      )}
    </div>
  );
}
