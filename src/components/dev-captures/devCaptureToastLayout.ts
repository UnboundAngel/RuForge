import { humanizeDevCaptureLabel } from "@/lib/devCaptureScreenLabel";

export const TOAST_THUMB_MAX_PX = 52;

const CARD_PAD_X = 8;
const CARD_PAD_Y = 5;
const CARD_GAP = 8;
const DISMISS_W = 20;
const LABEL_CHAR_PX = 6.5;

export function toastThumbSize(width: number, height: number): { w: number; h: number } {
  if (width <= 0 || height <= 0) return { w: TOAST_THUMB_MAX_PX, h: TOAST_THUMB_MAX_PX };
  const scale = TOAST_THUMB_MAX_PX / Math.max(width, height);
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

export function toastCardMetrics(shotW: number, shotH: number, contextLabel: string) {
  const thumb = toastThumbSize(shotW, shotH);
  const label = `${humanizeDevCaptureLabel(contextLabel)} saved`;
  const labelW = Math.ceil(label.length * LABEL_CHAR_PX);
  const cardW = CARD_PAD_X * 2 + thumb.w + CARD_GAP + labelW + CARD_GAP + DISMISS_W;
  const cardH = CARD_PAD_Y * 2 + thumb.h;
  return { thumb, cardW, cardH, label };
}

export type ToastMorphTargets = {
  card: DOMRect;
  thumb: DOMRect;
};

export function measureToastMorphTargets(
  stackEl: HTMLElement | null,
  shotW: number,
  shotH: number,
  contextLabel: string,
): ToastMorphTargets {
  const { thumb, cardW, cardH } = toastCardMetrics(shotW, shotH, contextLabel);
  const margin = 16;

  let cardTop = window.innerHeight - margin - cardH;
  let cardLeft = window.innerWidth - margin - cardW;

  const slot = stackEl?.querySelector<HTMLElement>("[data-dev-capture-toast-slot]");
  if (slot) {
    const slotR = slot.getBoundingClientRect();
    cardLeft = slotR.right - cardW;
    cardTop = slotR.top - cardH;
  }

  const card = new DOMRect(cardLeft, cardTop, cardW, cardH);
  const thumbRect = new DOMRect(
    card.left + CARD_PAD_X,
    card.top + (card.height - thumb.h) / 2,
    thumb.w,
    thumb.h,
  );

  return { card, thumb: thumbRect };
}

export const TOAST_CARD_PAD = `${CARD_PAD_Y}px ${CARD_PAD_X}px` as const;
export const TOAST_CARD_GAP = CARD_GAP;
