import { invoke } from "@tauri-apps/api/core";
import { refreshListenSnapshot } from "./musicListenSnapshot";

const IMPORT_FLAG = "ruforge-music-listen-legacy-imported-v1";
const LS_STATS = "ruforge-music-listen-stats";
const LS_HISTORY = "ruforge-music-play-history";

type LegacyStat = {
  identityKey: string;
  path: string;
  title: string;
  artist: string;
  playCount: number;
  listenTimeSec: number;
  lastPlayed: number;
};

type LegacyHistory = {
  path: string;
  identityKey: string;
  title: string;
  artist: string;
  playedAt: number;
  playCount: number;
};

function readLegacyStats(): LegacyStat[] {
  try {
    const raw = localStorage.getItem(LS_STATS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyStat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLegacyHistory(): LegacyHistory[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LegacyHistory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function importLegacyListenDataIfNeeded(): Promise<void> {
  if (localStorage.getItem(IMPORT_FLAG) === "1") return;
  const stats = readLegacyStats();
  const history = readLegacyHistory();
  if (stats.length === 0 && history.length === 0) {
    localStorage.setItem(IMPORT_FLAG, "1");
    return;
  }
  try {
    await invoke("music_listen_import_legacy", { stats, history });
    localStorage.setItem(IMPORT_FLAG, "1");
    await refreshListenSnapshot();
  } catch (e) {
    console.warn("music_listen_import_legacy failed", e);
  }
}
