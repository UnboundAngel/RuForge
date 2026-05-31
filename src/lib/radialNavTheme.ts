import type { NavMode } from "@/store/types";

export type RadialWedgePalette = {
  outerRing: string;
  wedge: string;
  wedgeStroke: string;
  wedgeActive: string;
  wedgeActiveStroke: string;
  centerFill: string;
  centerStroke: string;
  /** Active wedge icon + mode-flash label (portaled menu cannot inherit shell accent). */
  accent: string;
  iconIdle: string;
};

export const RADIAL_PALETTE: Record<NavMode, RadialWedgePalette> = {
  default: {
    outerRing: "#2a211c",
    wedge: "#322820",
    wedgeStroke: "rgb(237 207 155 / 0.1)",
    wedgeActive: "#4a3828",
    wedgeActiveStroke: "rgb(237 207 155 / 0.22)",
    centerFill: "#1c1512",
    centerStroke: "rgb(237 207 155 / 0.18)",
    accent: "#EDCF9B",
    iconIdle: "#78716c",
  },
  movie: {
    outerRing: "#2e2218",
    wedge: "#3a2a1e",
    wedgeStroke: "rgb(212 163 115 / 0.14)",
    wedgeActive: "#5c4530",
    wedgeActiveStroke: "rgb(212 163 115 / 0.26)",
    centerFill: "#1a1410",
    centerStroke: "rgb(212 163 115 / 0.22)",
    accent: "#D4A373",
    iconIdle: "#78716c",
  },
  music: {
    outerRing: "#14080c",
    wedge: "#1e0c12",
    wedgeStroke: "rgb(255 0 51 / 0.1)",
    wedgeActive: "#3d1220",
    wedgeActiveStroke: "rgb(255 0 51 / 0.3)",
    centerFill: "#0a0a0a",
    centerStroke: "rgb(255 0 51 / 0.24)",
    accent: "#ff0033",
    iconIdle: "rgb(255 255 255 / 0.38)",
  },
};

export const NAV_MODE_ENTER_LABEL: Record<NavMode, string> = {
  default: "Default",
  movie: "Movie",
  music: "Music",
};
