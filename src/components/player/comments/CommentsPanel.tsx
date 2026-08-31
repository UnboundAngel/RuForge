import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useScrollEdgeState } from "@/hooks/useScrollEdgeState";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ListFilter,
  MoreVertical,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideIcon,
} from "lucide-react";
import type { VideoComment } from "@/lib/videoCommentsTypes";
import {
  formatCommentLikes,
  getTotalRepliesCount,
  sortComments,
} from "./commentThreadUtils";

function CommentAvatar({ user, avatar }: { user: string; avatar: string }) {
  const [failed, setFailed] = useState(false);
  const initial = user.replace(/^@/, "").charAt(0).toUpperCase() || "?";

  if (avatar && !failed) {
    return (
      <img
        src={avatar}
        alt={user}
        onError={() => setFailed(true)}
        className="mt-[2px] h-7 w-7 shrink-0 rounded-full bg-white/10 object-cover"
      />
    );
  }

  return (
    <div
      className="mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-media-card)] text-[11px] font-bold text-white/70"
      aria-hidden
    >
      {initial}
    </div>
  );
}

function Sparkles({ trigger, color }: { trigger: number; color: string }) {
  const [sparks, setSparks] = useState<{ id: number; angle: number }[]>([]);

  useEffect(() => {
    if (trigger > 0) {
      setSparks(
        Array.from({ length: 6 }, (_, i) => ({
          id: Date.now() + i,
          angle: (i / 6) * 360,
        })),
      );
    }
  }, [trigger]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {sparks.map((s) => (
        <motion.div
          key={s.id}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{
            scale: [0, 1.2, 0],
            x: Math.cos(s.angle * (Math.PI / 180)) * 22,
            y: Math.sin(s.angle * (Math.PI / 180)) * 22,
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute h-[3px] w-[3px] rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ReactionButton({
  icon: Icon,
  type,
  count,
}: {
  icon: LucideIcon;
  type: "up" | "down";
  count?: number;
}) {
  const [active, setActive] = useState(false);
  const [trigger, setTrigger] = useState(0);
  const activeColor = type === "up" ? "#38bdf8" : "#f87171";

  const handleTap = () => {
    const nextActive = !active;
    setActive(nextActive);
    if (nextActive) setTrigger((t) => t + 1);
  };

  const displayCount =
    count !== undefined ? (active && type === "up" ? count + 1 : count) : undefined;

  return (
    <button
      type="button"
      onClick={handleTap}
      className="group/btn relative -ml-2 flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-2 py-1 text-white/80 outline-none transition-colors hover:bg-white/10"
    >
      <motion.div
        whileTap={{ scale: 0.85 }}
        animate={
          active
            ? { scale: [1, 1.15, 1], rotate: [0, -8, 8, -4, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.3, ease: "easeOut" }}
        key={active ? "active" : "inactive"}
      >
        <Icon
          size={15}
          strokeWidth={active ? 2 : 1.5}
          color={active ? activeColor : "currentColor"}
          fill={active ? activeColor : "none"}
        />
      </motion.div>
      <Sparkles trigger={trigger} color={activeColor} />
      {displayCount !== undefined && displayCount > 0 && (
        <span className={`text-[12px] font-medium ${active ? "text-white" : "text-white/60"}`}>
          {formatCommentLikes(displayCount)}
        </span>
      )}
    </button>
  );
}

const commentsFloatMenuClass =
  "absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-white/10 bg-stone-950/95 py-1 shadow-2xl backdrop-blur-xl";
const commentsFloatItemClass =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[11px] font-bold outline-none transition-colors hover:bg-white/5";

export function ActionMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div
      className={`relative transition-opacity ${
        isOpen ? "z-30 opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
      }`}
      ref={ref}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`-mr-2 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/90 ${isOpen ? "text-white/90 opacity-100" : ""}`}
        aria-label="More actions"
      >
        <MoreVertical size={16} />
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={commentsFloatMenuClass}
          >
            <button type="button" className={`${commentsFloatItemClass} text-stone-300 hover:text-white`}>
              Report
            </button>
            <button type="button" className={`${commentsFloatItemClass} text-stone-300 hover:text-white`}>
              Block user
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function FilterMenu({
  currentType,
  onChange,
}: {
  currentType: "top" | "newest";
  onChange: (type: "top" | "newest") => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex cursor-pointer items-center justify-center rounded-full p-2.5 text-white/90 transition-colors hover:bg-white/10 ${isOpen ? "bg-white/10" : ""}`}
        aria-label="Filter comments"
      >
        <ListFilter size={20} strokeWidth={2} />
      </button>
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={commentsFloatMenuClass}
          >
            {(
              [
                ["top", "Top comments"],
                ["newest", "Newest first"],
              ] as const
            ).map(([type, label]) => {
              const selected = currentType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onChange(type);
                    setIsOpen(false);
                  }}
                  className={`${commentsFloatItemClass} ${
                    selected ? "text-[color:var(--accent)]" : "text-stone-300 hover:text-white"
                  }`}
                >
                  <span>{label}</span>
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function FormattedText({ text }: { text: string }) {
  return (
    <p className="mb-1 whitespace-pre-wrap pr-2 text-[13.5px] font-medium leading-[1.45] text-white/90">
      {text.split(" ").map((word, i) =>
        word.startsWith("@") ? (
          <span key={`${word}-${i}`} className="text-sky-400">
            {word}{" "}
          </span>
        ) : (
          `${word} `
        ),
      )}
    </p>
  );
}

export function CommentThread({
  comment,
  depth = 0,
  isLast = true,
}: {
  comment: VideoComment;
  depth?: number;
  isLast?: boolean;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const hasRepliesData = comment.replies && comment.replies.length > 0;
  const hasReplies = hasRepliesData && showReplies;
  const totalReplies = getTotalRepliesCount(comment);

  return (
    <div className="relative pb-1 pt-4 transition-all duration-200">
      {depth > 0 && (
        <svg
          className="pointer-events-none absolute"
          style={{ left: -21.75, top: 0 }}
          width="38"
          height="32"
          viewBox="0 0 38 32"
          fill="none"
          aria-hidden
        >
          <path
            d="M 0.75 0 V 20 Q 0.75 32 12.75 32 H 36"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.5"
          />
        </svg>
      )}

      {depth > 0 && !isLast && (
        <div
          className="pointer-events-none absolute border-l-[1.5px] border-white/[0.15]"
          style={{ left: -21.75, top: 20, bottom: 0 }}
        />
      )}

      <div className="group relative flex w-full gap-3">
        <div className="group/thread relative flex w-7 shrink-0 select-none flex-col items-center">
          <CommentAvatar user={comment.user} avatar={comment.avatar} />

          {hasRepliesData && showReplies && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowReplies(false);
              }}
              className="absolute z-20 flex w-4 cursor-pointer select-none items-stretch justify-center border-none bg-transparent p-0 outline-none focus:outline-none"
              style={{ left: 6, top: 31, bottom: 0 }}
              title="Collapse replies"
            >
              <div className="h-full w-[1.5px] bg-white/[0.15] transition-all group-hover/thread:w-[2px] group-hover/thread:bg-sky-400" />
            </button>
          )}

          {hasRepliesData && !showReplies && (
            <div
              className="pointer-events-none absolute z-0 bg-white/[0.15] transition-colors group-hover/thread:bg-sky-400"
              style={{ left: 13.25, top: 31, bottom: 15, width: 1.5 }}
            />
          )}

          {hasRepliesData && !showReplies && (
            <svg
              className="pointer-events-none absolute z-0 text-white/[0.15] transition-colors group-hover/thread:text-sky-400"
              style={{ left: 12.5, bottom: 0, height: 16 }}
              width="28"
              height="16"
              viewBox="0 0 28 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M 0.75 0 V 4 Q 0.75 14 12 14 H 28"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center justify-between pr-1">
            <div className="flex min-w-0 items-center gap-2 truncate">
              <span className="truncate text-[13px] font-bold tracking-tight text-white/90">
                {comment.user}
              </span>
              {comment.time ? (
                <span className="shrink-0 text-[11.5px] font-medium text-white/40">
                  {comment.time}
                </span>
              ) : null}
            </div>
            <ActionMenu />
          </div>

          <FormattedText text={comment.text} />

          <div className="mt-1 flex items-center gap-1.5 text-white/80">
            <ReactionButton icon={ThumbsUp} type="up" count={comment.likes} />
            <ReactionButton icon={ThumbsDown} type="down" />
            {hasReplies ? (
              <button
                type="button"
                onClick={() => setShowReplies(false)}
                className="ml-1 flex cursor-pointer items-center gap-1 rounded-full border-none bg-transparent px-3 py-1.5 text-[12px] font-bold text-sky-400 outline-none transition-colors hover:bg-sky-400/10 hover:text-sky-300 focus:outline-none"
              >
                <ChevronUp size={13} />
                <span>Hide replies</span>
              </button>
            ) : null}
          </div>

          {hasRepliesData && !showReplies ? (
            <div className="group/repliesbtn mt-2.5 flex select-none items-center">
              <button
                type="button"
                onClick={() => setShowReplies(true)}
                className="flex cursor-pointer select-none items-center rounded-full border-none bg-transparent px-3 py-1 text-[13px] font-bold text-sky-400 outline-none transition-colors hover:bg-blue-400/10 hover:text-blue-300 focus:outline-none group-hover/thread:bg-blue-400/5 group-hover/thread:text-blue-300"
              >
                <span>
                  {totalReplies} {totalReplies === 1 ? "reply" : "replies"}
                </span>
                <ChevronDown size={14} className="ml-1.5 mt-0.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {hasReplies ? (
        <div className="relative ml-[35px]">
          {comment.replies.map((reply, i) => (
            <div key={reply.id} className="relative z-0">
              <CommentThread
                comment={reply}
                depth={depth + 1}
                isLast={i === comment.replies.length - 1}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

import type { VideoCommentsViewState } from "./useVideoComments";

type CommentsPanelProps = {
  comments: VideoComment[];
  filterType: "top" | "newest";
  onFilterChange: (type: "top" | "newest") => void;
  onClose: () => void;
  loading?: boolean;
  loadingLabel?: string;
  viewState?: VideoCommentsViewState;
  downloadCommentsEnabled?: boolean;
  onRetry?: () => void;
};

export function CommentsPanel({
  comments,
  filterType,
  onFilterChange,
  onClose,
  loading = false,
  loadingLabel = "Loading comments…",
  viewState = "loading",
  downloadCommentsEnabled = false,
  onRetry,
}: CommentsPanelProps) {
  const sortedComments = sortComments(comments, filterType);
  const showCapLabel = viewState === "ready" || viewState === "empty";
  const { scrollRef, edges, onScroll } = useScrollEdgeState([
    sortedComments.length,
    loading,
    viewState,
    filterType,
  ]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        className="rf-comments-header flex shrink-0 items-center justify-between px-6 pb-3 pt-5"
        data-scrolled={edges.top ? "true" : undefined}
      >
        <div className="flex items-baseline gap-3">
          <h2 className="text-[20px] font-bold tracking-tight text-white">Comments</h2>
          {showCapLabel ? (
            <span className="text-[14px] font-medium text-white/50">Top 25 threads</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-white/90">
          <FilterMenu currentType={filterType} onChange={onFilterChange} />
          <button
            type="button"
            className="cursor-pointer rounded-full p-2.5 transition-colors hover:bg-white/10"
            onClick={onClose}
            aria-label="Close comments"
          >
            <X size={22} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rf-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-8 pt-2"
      >
        {loading ? (
          <p className="px-1 py-8 text-[13px] font-medium text-white/45">{loadingLabel}</p>
        ) : viewState === "error" ? (
          <div className="px-1 py-8">
            <p className="text-[13px] font-medium text-white/45">
              Couldn&apos;t load comments. Tap to retry.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 cursor-pointer rounded-full border-none bg-transparent px-0 py-1 text-[13px] font-bold text-sky-400 outline-none transition-colors hover:text-sky-300"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : viewState === "missing" && !downloadCommentsEnabled ? (
          <p className="px-1 py-8 text-[13px] font-medium text-white/45">
            Comments weren&apos;t downloaded for this video. Enable Download comments in settings.
          </p>
        ) : viewState === "empty" ? (
          <p className="px-1 py-8 text-[13px] font-medium text-white/45">
            No comments on this video.
          </p>
        ) : sortedComments.length === 0 ? (
          <p className="px-1 py-8 text-[13px] font-medium text-white/45">
            No comments on this video.
          </p>
        ) : (
          sortedComments.map((thread) => (
            <CommentThread key={thread.id} comment={thread} />
          ))
        )}
      </div>
    </div>
  );
}
