import { useEffect, useState } from "react";
import { useRuforgeStore } from "@/store/ruforgeStore";

export type HeroSkin = "classic" | "cartoon" | "gothic" | "country" | "electro" | "street" | "museum" | "aero" | "punk" | "lofi";

export type SecretSkin = { skin: Exclude<HeroSkin, "classic">; word: string; label: string };

export const SECRET_SKINS: readonly SecretSkin[] = [
  { skin: "cartoon", word: "toon", label: "Cartoon" },
  { skin: "gothic", word: "goth", label: "Gothic" },
  { skin: "country", word: "howdy", label: "Country" },
  { skin: "electro", word: "electro", label: "Electro" },
  { skin: "street", word: "bars", label: "Street" },
  { skin: "museum", word: "opus", label: "Museum" },
  { skin: "aero", word: "aero", label: "Aero" },
  { skin: "punk", word: "punk", label: "Punk" },
  { skin: "lofi", word: "lofi", label: "Lo-fi" },
];

const STORAGE_KEY = "ruforge-hero-skin";
const FOUND_KEY = "ruforge-hero-skins-found";
const CHANGE_EVENT = "ruforge-hero-skin-change";
export const GALLERY_EVENT = "ruforge-hero-skin-gallery";
const GALLERY_WORD = "skins";
const SECRET_MAX_LEN = Math.max(GALLERY_WORD.length, ...SECRET_SKINS.map((s) => s.word.length));
const SKINS: readonly HeroSkin[] = ["classic", ...SECRET_SKINS.map((s) => s.skin)];

function readSkin(): HeroSkin {
  const saved = localStorage.getItem(STORAGE_KEY);
  return SKINS.find((s) => s === saved) ?? "classic";
}

export function readFoundSkins(): HeroSkin[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOUND_KEY) ?? "[]");
    return Array.isArray(raw) ? SKINS.filter((s) => raw.includes(s)) : [];
  } catch {
    return [];
  }
}

function markFound(skin: HeroSkin): number | null {
  const found = readFoundSkins();
  if (found.includes(skin)) return null;
  const next = [...found, skin];
  localStorage.setItem(FOUND_KEY, JSON.stringify(next));
  return next.length;
}

export function setHeroSkin(skin: HeroSkin) {
  localStorage.setItem(STORAGE_KEY, skin);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

function unlock({ skin, label }: SecretSkin) {
  const count = markFound(skin);
  if (count === null) return;
  const total = SECRET_SKINS.length;
  const tail = count === 1 ? ` Type "${GALLERY_WORD}" to see what else is hiding.` : "";
  useRuforgeStore.getState().notify(`Found the ${label} skin (${count} of ${total}).${tail}`);
}

/**
 * Easter egg: typing a secret word outside a text field toggles that skin on,
 * typing it again goes back to classic. The gallery word only answers once
 * at least one skin has been found.
 */
export function useHeroSkin(listenForSecret: boolean): HeroSkin {
  const [skin, setSkin] = useState<HeroSkin>(readSkin);

  useEffect(() => {
    const sync = () => setSkin(readSkin());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!listenForSecret) return;
    const worn = readSkin();
    if (worn !== "classic") markFound(worn);
    let typed = "";
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || isTypingTarget(e.target)) {
        typed = "";
        return;
      }
      typed = (typed + e.key.toLowerCase()).slice(-SECRET_MAX_LEN);
      if (typed.endsWith(GALLERY_WORD) && readFoundSkins().length > 0) {
        typed = "";
        window.dispatchEvent(new Event(GALLERY_EVENT));
        return;
      }
      for (const secret of SECRET_SKINS) {
        if (!typed.endsWith(secret.word)) continue;
        typed = "";
        const turningOn = readSkin() !== secret.skin;
        setHeroSkin(turningOn ? secret.skin : "classic");
        if (turningOn) unlock(secret);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listenForSecret]);

  return skin;
}
