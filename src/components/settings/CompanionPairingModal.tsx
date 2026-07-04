import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import ruforgeAppIcon from "../../assets/ruforgeAppIcon.png";
import { companionQrSvg } from "../../lib/companionQr";

const companionAccentBtn =
  "px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95";

const companionNeutralBtn =
  "px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95";

export type CompanionQrPayload = {
  url: string;
  ip: string;
  port: number;
  code: string;
  expSecs: number;
};

type CompanionPairingModalProps = {
  open: boolean;
  onClose: () => void;
  pairing: CompanionQrPayload | null;
  busy: boolean;
  onRefresh: () => void;
  onCopyLink: () => void;
  onOpenLocal: () => void;
};

function formatRemaining(expiresAtUnix: number): string {
  const remaining = Math.max(0, expiresAtUnix - Math.floor(Date.now() / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export const CompanionPairingModal: React.FC<CompanionPairingModalProps> = ({
  open,
  onClose,
  pairing,
  busy,
  onRefresh,
  onCopyLink,
  onOpenLocal,
}) => {
  const [remaining, setRemaining] = useState("2:00");

  useEffect(() => {
    if (!open || !pairing) return;
    const tick = () => setRemaining(formatRemaining(pairing.expSecs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, pairing]);

  const qrMarkup = useMemo(
    () => (pairing?.url ? companionQrSvg(pairing.url) : ""),
    [pairing?.url],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-[#0e0a08]/80 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="companion-pairing-title"
        className="relative w-full max-w-[360px] rounded-[var(--radius-modal)] bg-[#1D1613] px-5 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              LAN companion
            </p>
            <h2
              id="companion-pairing-title"
              className="text-[15px] font-semibold leading-snug text-stone-100"
            >
              Pair a phone or TV
            </h2>
            <p className="text-[11px] leading-relaxed text-stone-500">
              Same Wi-Fi only · one-time link · code expires in {remaining}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          {pairing && qrMarkup ? (
            <div className="w-[min(210px,52vw)] rounded-[var(--radius-input)] bg-[#f5ede4] p-3">
              <div className="relative aspect-square w-full">
                <div
                  className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: qrMarkup }}
                  aria-hidden
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="flex h-[14%] w-[14%] min-h-[24px] min-w-[24px] max-h-[32px] max-w-[32px] items-center justify-center rounded-[7px] bg-[#f5ede4] p-[5px] shadow-[inset_0_0_0_1px_rgba(28,21,18,0.1)]">
                    <img
                      src={ruforgeAppIcon}
                      alt=""
                      className="h-full w-full rounded-[3px] object-cover"
                      draggable={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex aspect-square w-[min(210px,52vw)] items-center justify-center rounded-[var(--radius-input)] bg-[#261d18] text-[10px] uppercase tracking-[0.12em] text-stone-500">
              No pairing link
            </div>
          )}

          {pairing?.url ? (
            <button
              type="button"
              onClick={() => void onCopyLink()}
              className="w-full max-w-full break-all px-1 text-center font-mono text-[11px] leading-snug text-stone-400 transition-colors hover:text-[color:var(--accent)]"
              title={pairing.url}
            >
              {pairing.url}
            </button>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={!pairing || busy}
            onClick={() => void onCopyLink()}
            className={companionAccentBtn}
          >
            COPY LINK
          </button>
          <button
            type="button"
            disabled={!pairing || busy}
            onClick={() => void onOpenLocal()}
            className={companionAccentBtn}
          >
            OPEN LOCALLY
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onRefresh()}
            className={companionNeutralBtn}
          >
            REFRESH CODE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
