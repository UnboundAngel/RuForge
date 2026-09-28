import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ChannelsUiState } from "@/watchlist/types";

type Props = {
  ui: ChannelsUiState;
  onFollowInput: (input: string) => void;
};

export function ChannelAddField({ ui, onFollowInput }: Props) {
  const [value, setValue] = useState("");
  const seenSeq = useRef(ui.followSeq);

  useEffect(() => {
    if (ui.followSeq === seenSeq.current) return;
    seenSeq.current = ui.followSeq;
    setValue("");
  }, [ui.followSeq]);

  const canSubmit = value.trim().length > 0 && !ui.followPending;
  const message = ui.followMessage;

  return (
    <form
      className="px-2 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onFollowInput(value);
      }}
    >
      <div className="flex items-center gap-1.5 rounded-[var(--radius-input)] bg-[color:var(--rf-popover-raised)] py-1 pl-3 pr-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a channel or video link"
          aria-label="Channel or video link"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-1 text-[12px] text-stone-100 outline-none placeholder:text-stone-500"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-7 min-w-[64px] items-center justify-center rounded-[10px] bg-[color:var(--accent)] px-3 text-[12px] font-bold text-stone-950 transition-[filter,opacity,transform] duration-150 hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
        >
          {ui.followPending ? <Loader2 size={14} className="animate-spin" aria-label="Following" /> : "Follow"}
        </button>
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-1.5 px-1 text-[11px] ${message.tone === "error" ? "text-amber-300/90" : "text-stone-500"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
