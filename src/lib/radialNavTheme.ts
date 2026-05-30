import type { NavMode } from "@/store/types";

export type RadialWedgePalette = {
  outerRing: string;
  wedge: string;
  wedgeStroke: string;
  wedgeActive: string;
  wedgeActiveStroke: string;
  centerFill: string;
  centerStroke: string;
};

export const RADIAL_PALETTE: Record<NavMode, RadialWedgePalette> = {
  default: {
    outerRing: "#2a211c",
    wedge: "#322820",
    wedgeStroke: "rgb(255 255 255 / 0.08)",
    wedgeActive: "#4a3830",
    wedgeActiveStroke: "rgb(255 255 255 / 0.14)",
    centerFill: "#1c1512",
    centerStroke: "rgb(255 255 255 / 0.12)",
  },
  movie: {
    outerRing: "#2e2218",
    wedge: "#3a2a1e",
    wedgeStroke: "rgb(237 207 155 / 0.12)",
    wedgeActive: "#5c4530",
    wedgeActiveStroke: "rgb(237 207 155 / 0.22)",
    centerFill: "#1a1410",
    centerStroke: "rgb(237 207 155 / 0.2)",
  },
  music: {
    outerRing: "#241c28",
    wedge: "#2e2436",
    wedgeStroke: "rgb(180 160 220 / 0.12)",
    wedgeActive: "#443858",
    wedgeActiveStroke: "rgb(180 160 220 / 0.22)",
    centerFill: "#16121a",
    centerStroke: "rgb(180 160 220 / 0.2)",
  },
};

export const NAV_MODE_ENTER_LABEL: Record<NavMode, string> = {
  default: "Default",
  movie: "Movie",
  music: "Music",
};
