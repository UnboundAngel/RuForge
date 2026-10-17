import type { NavMode } from "@/store/types";

/** Mirrors the shell nesting: bezel rim, carved well, raised tiles, raised hub. */
export type RadialWedgePalette = {
  rim: string;
  well: string;
  tile: string;
  tileActive: string;
  hub: string;
  /** Active icon, label, indicator and mode-flash label (portaled menu cannot inherit shell accent). */
  accent: string;
  iconIdle: string;
  labelIdle: string;
};

export const RADIAL_PALETTE: Record<NavMode, RadialWedgePalette> = {
  default: {
    rim: "var(--rf-bezel)",
    well: "var(--rf-well)",
    tile: "var(--rf-well-raised)",
    tileActive: "var(--rf-field-hover)",
    hub: "var(--rf-bezel)",
    accent: "#EDCF9B",
    iconIdle: "#a8a29e",
    labelIdle: "#78716c",
  },
  music: {
    rim: "#161010",
    well: "#0a0a0a",
    tile: "#171313",
    tileActive: "#2c1218",
    hub: "#161010",
    accent: "#ff0033",
    iconIdle: "rgb(255 255 255 / 0.6)",
    labelIdle: "rgb(255 255 255 / 0.38)",
  },
};

export const NAV_MODE_ENTER_LABEL: Record<NavMode, string> = {
  default: "Default",
  music: "Music",
};
