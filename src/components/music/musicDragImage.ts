import type { DragEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { setMusicTrackDragData, trackArtistLabel } from "./musicPlaylists";

/**
 * Replaces the browser's translucent row ghost with a compact card: cover, title, artist,
 * red edge. The node only has to exist while the browser snapshots it, so it is removed next tick.
 */
export function setMusicTrackDragImage(e: DragEvent, file: MediaFile): void {
  if (typeof e.dataTransfer.setDragImage !== "function") return;
  const card = document.createElement("div");
  card.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "display:flex",
    "align-items:center",
    "gap:10px",
    "max-width:280px",
    "padding:6px 14px 6px 6px",
    "border-radius:8px",
    "background:#181818",
    "border:1px solid color-mix(in srgb, var(--music-accent, #ff0033) 55%, transparent)",
    "box-shadow:inset 3px 0 0 var(--music-accent, #ff0033), 0 10px 30px rgba(0,0,0,0.5)",
    "color:#fff",
    "font-size:13px",
    "line-height:1.25",
    "pointer-events:none",
    "z-index:-1",
  ].join(";");

  const cover = bestCoverPath(file);
  const thumb = document.createElement(cover ? "img" : "div");
  thumb.style.cssText =
    "width:36px;height:36px;flex-shrink:0;border-radius:4px;object-fit:cover;background:color-mix(in srgb, var(--music-accent, #ff0033) 25%, #222)";
  if (cover && thumb instanceof HTMLImageElement) thumb.src = convertFileSrc(cover);
  card.appendChild(thumb);

  const text = document.createElement("div");
  text.style.cssText = "min-width:0;display:flex;flex-direction:column";
  const title = document.createElement("div");
  title.textContent = file.canonicalTitle ?? file.name;
  title.style.cssText = "font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  text.appendChild(title);
  const artist = trackArtistLabel(file);
  if (artist) {
    const sub = document.createElement("div");
    sub.textContent = artist;
    sub.style.cssText =
      "font-size:12px;color:rgba(255,255,255,0.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    text.appendChild(sub);
  }
  card.appendChild(text);

  document.body.appendChild(card);
  e.dataTransfer.setDragImage(card, 18, 24);
  window.setTimeout(() => card.remove(), 0);
}

/** Drag props for a single-song row: the sidebar-drop payload plus the card preview. */
export function musicTrackDragProps(file: MediaFile) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setMusicTrackDragData(e, [file.path]);
      setMusicTrackDragImage(e, file);
    },
  };
}
