import { motion } from "motion/react";
import { AlertTriangle, CircleCheck, CircleX, Loader2 } from "lucide-react";
import type { RuforgeNotification } from "@/store/ruforgeStore";

export type IslandNotice = {
  id: number;
  message: string;
  type: NonNullable<RuforgeNotification["type"]>;
};

export function IslandNoticeContent({ notice, accentColor }: { notice: IslandNotice; accentColor: string }) {
  const iconClass = "shrink-0";
  const icon =
    notice.type === "error" ? (
      <CircleX size={14} className={`${iconClass} text-rose-400`} />
    ) : notice.type === "warning" ? (
      <AlertTriangle size={14} className={`${iconClass} text-amber-300`} />
    ) : notice.type === "progress" ? (
      <Loader2 size={14} className={`${iconClass} animate-spin`} style={{ color: accentColor }} />
    ) : (
      <CircleCheck size={14} className={iconClass} style={{ color: accentColor }} />
    );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.18, delay: 0.06 } }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
      className="absolute inset-0 flex min-w-0 items-center justify-center gap-2 px-4"
      role="status"
    >
      {icon}
      <span className="min-w-0 truncate whitespace-nowrap text-[12px] font-medium text-stone-100">
        {notice.message}
      </span>
    </motion.div>
  );
}

export function noticeIslandWidth(message: string): number {
  return Math.min(350, Math.max(160, Math.ceil(message.length * 6.4) + 60));
}
