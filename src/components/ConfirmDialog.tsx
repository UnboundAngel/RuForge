import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { OVERLAY_Z_CLASS } from "../lib/overlayZIndex";
import {
  SettingsModalBtnPrimary,
  SettingsModalBtnSecondary,
  SettingsModalShell,
  SettingsModalSurface,
} from "./settings/SettingsModalShell";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  itemPreview?: string | null;
  itemMeta?: string;
};

type PendingConfirm = ConfirmDialogOptions & {
  resolve: (approved: boolean) => void;
};

let setPendingHost: ((pending: PendingConfirm | null) => void) | null = null;

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

function ConfirmDialogView({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingConfirm;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmLabel = pending.confirmLabel ?? "Confirm";
  const cancelLabel = pending.cancelLabel ?? "Cancel";

  return (
    <SettingsModalShell
      open
      onClose={onCancel}
      titleId="rf-confirm-title"
      title={pending.title}
      description={pending.message}
      eyebrow={null}
      zIndexClass={OVERLAY_Z_CLASS.confirm}
      maxWidthClass="max-w-md"
      footer={
        <>
          <SettingsModalBtnSecondary onClick={onCancel}>{cancelLabel}</SettingsModalBtnSecondary>
          <SettingsModalBtnPrimary
            onClick={onConfirm}
            className="bg-red-500/90 text-stone-100 hover:brightness-110"
          >
            {confirmLabel}
          </SettingsModalBtnPrimary>
        </>
      }
    >
      {pending.itemPreview ? (
        <div className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-input)] bg-[#110D0B]">
            <img
              src={convertFileSrc(pending.itemPreview)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-40 blur-2xl scale-110"
              aria-hidden
            />
            <img
              src={convertFileSrc(pending.itemPreview)}
              alt=""
              className="relative h-full w-full object-cover"
            />
          </div>
          {pending.itemMeta ? (
            <SettingsModalSurface>
              <p className="text-[11px] text-stone-500">{pending.itemMeta}</p>
            </SettingsModalSurface>
          ) : null}
        </div>
      ) : pending.itemMeta ? (
        <SettingsModalSurface>
          <p className="text-[11px] text-stone-500">{pending.itemMeta}</p>
        </SettingsModalSurface>
      ) : null}
    </SettingsModalShell>
  );
}

/** Mount once near the app root (e.g. `App.tsx`). Portaled to `document.body`. */
export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    setPendingHost = setPending;
    return () => {
      setPendingHost = null;
    };
  }, []);

  const settle = useCallback((approved: boolean) => {
    setPending((current) => {
      if (current) current.resolve(approved);
      return null;
    });
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return createPortal(
    <AnimatePresence>
      {pending ? (
        <ConfirmDialogView
          key="confirm-dialog"
          pending={pending}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
