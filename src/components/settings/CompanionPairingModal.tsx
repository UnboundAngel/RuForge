import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import ruforgeAppIcon from "../../assets/ruforgeAppIcon.png";
import { companionQrSvg } from "../../lib/companionQr";
import { OVERLAY_Z_CLASS } from "../../lib/overlayZIndex";
import {
  motionDuration,
  overlayFadeTransition,
  overlayPanelTransition,
} from "../../lib/overlayMotion";

export type CompanionQrPayload = {
  url: string;
  phoneUrl: string | null;
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

const PAIRING_TTL_SECS = 120;

function secondsLeft(expiresAtUnix: number): number {
  return Math.max(0, expiresAtUnix - Math.floor(Date.now() / 1000));
}

function QrTile({ value }: { value: string }) {
  const markup = useMemo(() => (value ? companionQrSvg(value) : ""), [value]);
  return (
    <div className="w-[200px] rounded-[18px] bg-[#f5ede4] p-3.5">
      <div className="relative aspect-square w-full">
        {markup ? (
          <>
            <div
              className="absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: markup }}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[30px] w-[30px] rounded-[8px] bg-[#f5ede4] p-[5px]">
                <img
                  src={ruforgeAppIcon}
                  alt=""
                  className="h-full w-full rounded-[4px] object-cover"
                  draggable={false}
                />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function CodeCells({ code, dim }: { code: string; dim: boolean }) {
  const chars = code.padEnd(8, " ").slice(0, 8).split("");
  const group = (from: number) => (
    <div className="flex gap-1.5">
      {chars.slice(from, from + 4).map((ch, i) => (
        <span
          key={from + i}
          className={`flex h-[52px] w-9 items-center justify-center rounded-[12px] bg-[color:var(--rf-field)] font-display text-[26px] font-bold transition-colors duration-200 ${
            dim ? "text-stone-600" : "text-stone-100"
          }`}
        >
          {ch}
        </span>
      ))}
    </div>
  );
  return (
    <div className="flex select-all gap-3" aria-label={`Pairing code ${code}`}>
      {group(0)}
      {group(4)}
    </div>
  );
}

export const CompanionPairingModal: React.FC<CompanionPairingModalProps> = ({
  open,
  onClose,
  pairing,
  busy,
  onRefresh,
  onOpenLocal,
}) => {
  const reduceMotion = useReducedMotion();
  const [left, setLeft] = useState(PAIRING_TTL_SECS);
  const [dismissReady, setDismissReady] = useState(false);

  useEffect(() => {
    if (!open) setDismissReady(false);
  }, [open]);

  useEffect(() => {
    if (!open || !pairing) return;
    const tick = () => setLeft(secondsLeft(pairing.expSecs));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, pairing]);

  const phone = pairing?.phoneUrl != null;
  const expired = pairing != null && left === 0;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="companion-pairing"
          className={`fixed inset-0 ${OVERLAY_Z_CLASS.fullscreen} flex items-center justify-center bg-black/65 p-6`}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionDuration(reduceMotion, overlayFadeTransition)}
          onAnimationComplete={() => setDismissReady(true)}
        >
          <button
            type="button"
            className={`absolute inset-0 cursor-default ${dismissReady ? "" : "pointer-events-none"}`}
            aria-label="Close"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={phone ? "Pair a phone" : "Pairing link"}
            className="relative rounded-[24px] bg-[color:var(--rf-surface)] p-[7px] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={motionDuration(reduceMotion, overlayPanelTransition)}
          >
            <div className="relative flex flex-col items-center rounded-[18px] bg-[color:var(--rf-surface-deep)] px-8 pb-7 pt-9">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200"
                aria-label="Close"
              >
                <X size={18} />
              </button>

              <QrTile value={(phone ? pairing?.phoneUrl : pairing?.url) ?? ""} />

              {phone && pairing ? (
                <>
                  <div className="mt-6">
                    <CodeCells code={pairing.code} dim={expired} />
                  </div>
                  <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[color:var(--rf-field)]">
                    <div
                      className="h-full w-full origin-left rounded-full bg-[color:var(--accent)] transition-transform duration-1000 ease-linear"
                      style={{ transform: `scaleX(${left / PAIRING_TTL_SECS})` }}
                    />
                  </div>
                </>
              ) : null}

              <div className="mt-5 flex h-8 items-center">
                {expired ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onRefresh}
                    className="rounded-[var(--radius-input)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--accent)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                  >
                    New code
                  </button>
                ) : phone ? (
                  <p className="text-[12px] text-stone-500">
                    Scan with your iPhone, then type this code
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={!pairing || busy}
                    onClick={onOpenLocal}
                    className="rounded-[var(--radius-input)] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--accent)] transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                  >
                    Open on this PC
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
