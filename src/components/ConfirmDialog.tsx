import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { localImageSrc, localThumbSrc } from "@/lib/localImageSrc";
import { Music } from "lucide-react";
import { OVERLAY_Z_CLASS } from "../lib/overlayZIndex";
import {
  MusicModalBtn,
  SettingsModalBtnDanger,
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
  SettingsModalSurface,
} from "./settings/SettingsModalShell";

/** The thing the question is about, shown as proof under the message. */
export type ConfirmDialogItem = {
  /** Local image path; app theme shows a 16:9 thumb, music a square cover. */
  preview?: string | null;
  title?: string;
  /** Short secondary fact, e.g. file size or track count. */
  detail?: string;
};

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  item?: ConfirmDialogItem;
  /** `danger` paints the confirm red (deletes); `accent` is the plain primary. Default `danger`. */
  tone?: "danger" | "accent";
  /** Music mode: black and white panel, pill buttons, square cover row. */
  theme?: "app" | "music";
};

type PendingConfirm = ConfirmDialogOptions & {
  resolve: (approved: boolean) => void;
};

let setPendingHost: ((pending: PendingConfirm) => void) | null = null;

/** Promise resolves `true` on confirm, `false` on cancel or if host is not mounted. */
export function askConfirm(options: ConfirmDialogOptions): Promise<boolean> {
  const host = setPendingHost;
  if (!host) {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    host({ ...options, resolve });
  });
}

/** Mount once near the app root (e.g. `App.tsx`). Portaled to `document.body`. */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);
  const closingRef = useRef(false);
  const settledRef = useRef(false);

  const takeIncoming = useCallback((next: PendingConfirm) => {
    setPending((cur) => {
      if (cur && !settledRef.current) cur.resolve(false);
      return next;
    });
    settledRef.current = false;
    closingRef.current = false;
    setOpen(true);
  }, []);

  setPendingHost = takeIncoming;
  useEffect(() => {
    setPendingHost = takeIncoming;
    return () => {
      if (setPendingHost === takeIncoming) setPendingHost = null;
    };
  }, [takeIncoming]);

  const settle = useCallback((approved: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    closingRef.current = true;
    setPending((current) => {
      if (current) current.resolve(approved);
      return current;
    });
    setOpen(false);
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);
  const music = pending?.theme === "music";
  const ConfirmBtn = pending?.tone === "accent" ? SettingsModalBtnPrimary : SettingsModalBtnDanger;

  return createPortal(
    <SettingsModalShell
      open={open && pending !== null}
      onClose={onCancel}
      onExitComplete={() => {
        if (!closingRef.current) return;
        closingRef.current = false;
        setPending(null);
      }}
      titleId="rf-confirm-title"
      title={pending?.title ?? ""}
      description={pending?.message}
      eyebrow={null}
      zIndexClass={OVERLAY_Z_CLASS.confirm}
      maxWidthClass="max-w-md"
      theme={music ? "music" : "app"}
      footer={
        pending && music ? (
          <>
            <MusicModalBtn onClick={onCancel}>{pending.cancelLabel ?? "Cancel"}</MusicModalBtn>
            <MusicModalBtn variant="primary" onClick={onConfirm}>
              {pending.confirmLabel ?? "Confirm"}
            </MusicModalBtn>
          </>
        ) : pending ? (
          <>
            <SettingsModalBtnSecondary onClick={onCancel}>
              {pending.cancelLabel ?? "Cancel"}
            </SettingsModalBtnSecondary>
            <ConfirmBtn onClick={onConfirm}>{pending.confirmLabel ?? "Confirm"}</ConfirmBtn>
          </>
        ) : null
      }
    >
      {pending?.item ? (
        music ? <MusicConfirmItem item={pending.item} /> : <AppConfirmItem item={pending.item} />
      ) : null}
    </SettingsModalShell>,
    document.body,
  );
}

function AppConfirmItem({ item }: { item: ConfirmDialogItem }) {
  const meta = [item.detail, item.title].filter(Boolean).join(" • ");
  return (
    <div className="space-y-3">
      {item.preview ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-input)] bg-[color:var(--rf-well)]">
          <img
            src={localImageSrc(item.preview)}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40 blur-2xl scale-110"
            aria-hidden
          />
          <img src={localImageSrc(item.preview)} alt="" className="relative h-full w-full object-cover" />
        </div>
      ) : null}
      {meta ? (
        <SettingsModalSurface>
          <p className="text-[11px] text-stone-500">{meta}</p>
        </SettingsModalSurface>
      ) : null}
    </div>
  );
}

function MusicConfirmItem({ item }: { item: ConfirmDialogItem }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] p-2">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-white/[0.08]">
        {item.preview ? (
          <img src={localThumbSrc(item.preview)} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="m-auto h-full w-6 text-white/40" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {item.title ? <p className="truncate text-sm font-semibold text-white">{item.title}</p> : null}
        {item.detail ? <p className="mt-0.5 text-xs text-white/60">{item.detail}</p> : null}
      </div>
    </div>
  );
}
