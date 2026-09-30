import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ChannelsUiState } from "@/watchlist/types";
import { controlLabelClass, raisedClass } from "../panelStyles";

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
      className="px-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onFollowInput(value);
      }}
    >
      <div className={`flex h-11 items-center gap-2 pl-4 pr-1.5 focus-within:ring-1 focus-within:ring-white/15 ${raisedClass}`}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste a channel or video link"
          aria-label="Channel or video link"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-stone-100 outline-none placeholder:text-stone-500"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className={`flex h-8 min-w-[72px] items-center justify-center rounded-lg px-3 transition-colors duration-150 ${controlLabelClass} ${
            canSubmit || ui.followPending
              ? "bg-[color:var(--accent)] text-[color:var(--rf-popover-cta-fg,#1d1613)]"
              : "text-stone-600"
          }`}
        >
          {ui.followPending ? <Loader2 size={16} className="animate-spin" aria-label="Following" /> : "Follow"}
        </button>
      </div>
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mt-2 px-2 text-[12px] ${message.tone === "error" ? "text-amber-300/90" : "text-stone-400"}`}
        >
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
