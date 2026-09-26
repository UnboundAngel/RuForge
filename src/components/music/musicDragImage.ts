import type { DragEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { bestCoverPath } from "@/mediaKind";
import type { MediaFile } from "@/types";
import { setMusicTrackDragData, trackArtistLabel } from "./musicPlaylists";

/** Gap between the cursor tip and the card's top-left corner. */
const CURSOR_OFFSET = 14;

let activeGhost: { el: HTMLElement; stop: () => void } | null = null;

/**
 * Hides the browser's drag snapshot. WebView2 draws that snapshot washed out, so the
 * real preview is an ordinary element that follows the cursor instead.
 */
function hideNativeDragImage(e: DragEvent): void {
  if (typeof e.dataTransfer.setDragImage !== "function") return;
  const blank = document.createElement("div");
  blank.style.cssText = "position:fixed;top:-10px;left:-10px;width:1px;height:1px;opacity:0";
  document.body.appendChild(blank);
  e.dataTransfer.setDragImage(blank, 0, 0);
  window.setTimeout(() => blank.remove(), 0);
}

function buildGhost(file: MediaFile): HTMLElement {
  const card = document.createElement("div");
  card.className = "rf-music-drag-ghost";

  const cover = bestCoverPath(file);
  const thumb = document.createElement(cover ? "img" : "div");
  thumb.className = "rf-music-drag-ghost-cover";
  if (cover && thumb instanceof HTMLImageElement) thumb.src = convertFileSrc(cover);
  card.appendChild(thumb);

  const text = document.createElement("div");
  text.className = "rf-music-drag-ghost-text";
  const title = document.createElement("div");
  title.className = "rf-music-drag-ghost-title";
  title.textContent = file.canonicalTitle ?? file.name;
  text.appendChild(title);
  const artist = trackArtistLabel(file);
  if (artist) {
    const sub = document.createElement("div");
    sub.className = "rf-music-drag-ghost-artist";
    sub.textContent = artist;
    text.appendChild(sub);
  }
  card.appendChild(text);
  return card;
}

function clearGhost(): void {
  activeGhost?.stop();
  activeGhost = null;
}

function clearIfReleased(ev: MouseEvent): void {
  if (ev.buttons === 0) clearGhost();
}

/**
 * Shows a song card beside the cursor for the length of a drag: cover, title, artist,
 * on the same raised surface as the app's menus.
 */
export function setMusicTrackDragImage(e: DragEvent, file: MediaFile): void {
  clearGhost();
  hideNativeDragImage(e);

  const el = buildGhost(file);
  const place = (x: number, y: number) => {
    el.style.transform = `translate(${x + CURSOR_OFFSET}px, ${y + CURSOR_OFFSET}px)`;
  };
  place(e.clientX, e.clientY);
  document.body.appendChild(el);

  const onOver = (ev: globalThis.DragEvent) => {
    // Some drag events report 0,0 while the cursor is outside the window.
    if (ev.clientX === 0 && ev.clientY === 0) return;
    el.style.visibility = "visible";
    place(ev.clientX, ev.clientY);
  };
  const onLeave = (ev: globalThis.DragEvent) => {
    if (ev.relatedTarget == null) el.style.visibility = "hidden";
  };

  const stop = () => {
    document.removeEventListener("dragover", onOver, true);
    document.removeEventListener("dragleave", onLeave, true);
    document.removeEventListener("dragend", clearGhost, true);
    document.removeEventListener("drop", clearGhost, true);
    // Mouse events are suppressed during a drag, so a buttonless move means it ended even
    // if the source row unmounted before its dragend could reach the document.
    document.removeEventListener("mousemove", clearIfReleased, true);
    el.remove();
  };
  document.addEventListener("dragover", onOver, true);
  document.addEventListener("dragleave", onLeave, true);
  document.addEventListener("dragend", clearGhost, true);
  document.addEventListener("drop", clearGhost, true);
  window.setTimeout(() => {
    if (activeGhost?.el === el) document.addEventListener("mousemove", clearIfReleased, true);
  }, 0);

  activeGhost = { el, stop };
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
