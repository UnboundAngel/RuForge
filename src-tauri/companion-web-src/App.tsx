import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  startTransition,
  useState,
  type CSSProperties,
  type RefObject,
  type SyntheticEvent,
} from "react";
import "./styles.css";
import { GateCard } from "./components/GateCard";
import { setClock, useClockSelector } from "./playbackClock";
import { Intros } from "./components/IntroSheet";
import { requestIntro } from "./intro";
import { listOffline, offlineUrl } from "./offline";
import { readCatalog, touchCatalog, writeCatalog } from "./catalogCache";
import {
  clearSideData,
  flushProgressQueue,
  pickResume,
  readLocalProgress,
  readSidecar,
  recordProgress,
  writeSidecar,
} from "./sideData";
import { isSaved, isSaving, onNotice, runSaveQueue, setReachable, startSave, useOfflineState } from "./offlineStore";
import { ago, askPersistentStorage, wipeCachedData } from "./storage";
import { openIntro } from "./intro";
import { readSettings } from "./settings";
import { HomeTab } from "./components/HomeTab";
import { LibraryTab } from "./components/LibraryTab";
import { SearchView } from "./components/SearchView";
import { AnimatePresence, m } from "motion/react";
import { DetailLayer, DetailPage } from "./components/DetailPage";
import { pageFadeTransition } from "./motion";
import { NowPlayingBar } from "./components/NowPlayingBar";
import { PlayerSheet } from "./components/PlayerSheet";
import { QueueSheet } from "./components/QueueSheet";
import { TabBar } from "./components/TabBar";
import { PullRing, usePullToRefresh } from "./components/PullToRefresh";
import { useAppViewport } from "./viewport";
import { artUrl } from "./components/LazyThumb";
import { useArtTint } from "./artColor";
import { pushRecent, readRecent } from "./history";
import { artistGroups, artistKeyOf, isAudio, type Group } from "./library";
import {
  checkHealth,
  fetchLibrary,
  fetchProgress,
  fetchSidecar,
  fetchStreamToken,
  fetchMediaUrl,
  pairWithCode,
  postProgress,
} from "./api";
import { playsHere } from "./playback";
import {
  itemMediaType,
  type CompanionItem,
  type HomeChip,
  type LibraryChip,
  type LibrarySort,
  type MediaMode,
  type SessionState,
  type SponsorSegment,
  type Tab,
} from "./types";

const PROGRESS_DEBOUNCE_MS = 8000;
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;
const CATALOG_REFRESH_MAX_POLLS = 60;
const RESUME_MIN_SECS = 5;
const RESUME_TAIL_SECS = 10;
const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

const NOT_SAVED_OFFLINE = "Not saved on this phone. Save it next time you're connected.";

const PLAYER_SPEED_KEY = "rf_companion_player_speed";
const PLAYER_LOOP_KEY = "rf_companion_player_loop";
const PLAYER_SB_KEY = "rf_companion_sb_enabled";
const LIB_SORT_KEY = "rf_companion_lib_sort";

const SESSION_ERRORS = new Set(["no_session", "invalid_session", "session_revoked", "expired"]);
const SESSION_GATE_CODES = new Set(["session-lost", "expired", "unpaired"]);

function readLS(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeLS(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

function readPairingCode(): string | null {
  try {
    const code = new URLSearchParams(window.location.search).get("c");
    return code?.trim() || null;
  } catch {
    return null;
  }
}

function sessionStateForAuthCode(code: string): SessionState {
  if (code === "no_session") return "unpaired";
  if (code === "invalid_session" || code === "session_revoked") return "session-lost";
  if (code === "expired" || code === "invalid_pairing_code") return "expired";
  if (SESSION_GATE_CODES.has(code)) return code as SessionState;
  return "session-lost";
}

function readStoredSpeed() {
  const v = parseFloat(readLS(PLAYER_SPEED_KEY, "1"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
function readStoredLoop() {
  const r = readLS(PLAYER_LOOP_KEY, "false");
  return r === "1" || r === "true";
}
function readStoredSbEnabled() {
  const r = readLS(PLAYER_SB_KEY, "1");
  return r !== "0" && r !== "false";
}

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export default function App() {
  const [session, setSession] = useState<SessionState>("loading");
  const [items, setItems] = useState<CompanionItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [catalogAt, setCatalogAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);
  const [tab, setTab] = useState<Tab>("home");
  const [homeChip, setHomeChip] = useState<HomeChip>("all");
  const [libChip, setLibChip] = useState<LibraryChip>("songs");
  const [libSort, setLibSortState] = useState<LibrarySort>(() => {
    const v = readLS(LIB_SORT_KEY, "recent");
    return v === "title" || v === "artist" ? v : "recent";
  });
  const [stack, setStack] = useState<Group[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>(readRecent);
  const [query, setQuery] = useState("");
  const [playerOpen, setPlayerOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [playContext, setPlayContext] = useState("Your library");
  const [shuffle, setShuffleState] = useState(false);
  const unshuffledRef = useRef<CompanionItem[] | null>(null);
  const shuffleRef = useRef(false);
  const [trackDir, setTrackDir] = useState(1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<MediaMode>("audio");
  const [playlist, setPlaylist] = useState<CompanionItem[]>([]);
  const [paused, setPaused] = useState(true);
  const [duration, setDuration] = useState(0);
  const [loop, setLoopState] = useState(readStoredLoop);
  const [speed, setSpeedState] = useState(readStoredSpeed);
  const [sbEnabled, setSbEnabledState] = useState(readStoredSbEnabled);
  const [sbSegments, setSbSegments] = useState<SponsorSegment[]>([]);
  const [spriteCount, setSpriteCount] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(RECONNECT_BASE_MS);
  const reconnectInFlight = useRef(false);
  const catalogPollCount = useRef(0);
  const catalogPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressPending = useRef<{ positionSecs: number; durationSecs: number; playbackState: "playing" | "paused" | "ended" } | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const activeKindRef = useRef<MediaMode>("audio");
  const playbackRequestRef = useRef(0);
  const retriedRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionState>("loading");
  const localUrlRef = useRef<string | null>(null);
  const scrollRefs = useRef<Record<Tab, HTMLDivElement | null>>({ home: null, search: null, library: null });

  const offlineModeRef = useRef(false);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => {
    offlineModeRef.current = offlineMode;
    setReachable(!offlineMode);
    document.documentElement.classList.toggle("rf-offline", offlineMode);
    if (offlineMode) requestIntro("offline");
  }, [offlineMode]);

  useEffect(() => onNotice(flash), [flash]);

  useEffect(() => {
    askPersistentStorage();
    const flush = () => void flushProgressQueue(postProgress);
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  const etagRef = useRef<string | null>(null);
  const hasCatalogRef = useRef(false);

  const applyRefreshing = (on: boolean) => {
    if (on) {
      setRefreshing(true);
      scheduleCatalogPoll();
    } else {
      setRefreshing(false);
      catalogPollCount.current = 0;
    }
  };

  const loadLibrary = useCallback(async (silent = false) => {
    if (!silent && !hasCatalogRef.current) setSession("loading");
    let result = await fetchLibrary(etagRef.current);
    if (!result.ok && result.error.kind === "session") {
      const pairingCode = readPairingCode();
      if (pairingCode) {
        const paired = await pairWithCode(pairingCode);
        if (!paired.ok && paired.error.kind !== "network") {
          await dropCatalog();
          setSession(sessionStateForAuthCode(paired.error.code ?? "invalid_pairing_code"));
          return;
        }
        if (paired.ok) {
          etagRef.current = null;
          result = await fetchLibrary();
        } else {
          result = { ok: false, error: { kind: "network" } };
        }
      }
    }
    if (!result.ok) {
      const code = result.error.code ?? "";
      if (result.error.kind === "session" || SESSION_ERRORS.has(code) || SESSION_GATE_CODES.has(code)) {
        await dropCatalog();
        setSession(sessionStateForAuthCode(code));
        return;
      }
      if (hasCatalogRef.current) {
        // Saves outlive their PC entry, so a copy removed on the PC still plays here.
        const saved = await listOffline();
        setItems((cur) => {
          const known = new Set(cur.map((i) => i.id));
          const extra = saved.filter((e) => !known.has(e.id));
          return extra.length ? [...cur, ...extra] : cur;
        });
        setOfflineMode(true);
        setSession("paired");
      } else if (!silent || sessionRef.current !== "paired") {
        const saved = await listOffline();
        if (saved.length > 0) {
          setItems(saved);
          setOfflineMode(true);
          setSession("paired");
        } else {
          setSession("disconnected");
        }
      }
      scheduleReconnect();
      return;
    }
    reconnectDelay.current = RECONNECT_BASE_MS;
    if (offlineModeRef.current) {
      flash("Back online");
      void flushProgressQueue(postProgress);
      setReachable(true);
      void runSaveQueue();
    }
    setOfflineMode(false);
    setSession("paired");
    etagRef.current = result.etag;
    const now = Date.now();
    setCatalogAt(now);
    if (result.notModified) {
      void touchCatalog(now);
      return;
    }
    const nextItems = result.data.items ?? [];
    const busy = !!result.data.refreshing;
    hasCatalogRef.current = true;
    setItems(nextItems);
    void writeCatalog({ items: nextItems, etag: result.etag, refreshing: busy, fetchedAt: now });
    applyRefreshing(busy);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function dropCatalog() {
    hasCatalogRef.current = false;
    etagRef.current = null;
    setItems([]);
    setOfflineMode(false);
    setCatalogAt(null);
    await wipeCachedData();
  }

  function scheduleReconnect() {
    if (reconnectInFlight.current) return;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    reconnectTimer.current = setTimeout(async () => {
      reconnectInFlight.current = true;
      const alive = await checkHealth();
      reconnectInFlight.current = false;
      if (alive) {
        await loadLibrary(true);
      } else {
        reconnectDelay.current = Math.min(reconnectDelay.current * 1.5, RECONNECT_MAX_MS);
        scheduleReconnect();
      }
    }, reconnectDelay.current);
  }

  function scheduleCatalogPoll() {
    if (catalogPollTimer.current) clearTimeout(catalogPollTimer.current);
    catalogPollCount.current += 1;
    if (catalogPollCount.current > CATALOG_REFRESH_MAX_POLLS) {
      setRefreshing(false);
      return;
    }
    catalogPollTimer.current = setTimeout(async () => {
      const result = await fetchLibrary(etagRef.current);
      if (!result.ok) return;
      if (result.notModified) {
        scheduleCatalogPoll();
        return;
      }
      const nextItems = result.data.items ?? [];
      const busy = !!result.data.refreshing;
      etagRef.current = result.etag;
      setItems(nextItems);
      void writeCatalog({ items: nextItems, etag: result.etag, refreshing: busy, fetchedAt: Date.now() });
      if (busy) {
        scheduleCatalogPoll();
      } else {
        setRefreshing(false);
        catalogPollCount.current = 0;
      }
    }, 3000);
  }

  // Paint from the stored catalog first; the PC only confirms or replaces it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readCatalog();
      if (cancelled) return;
      if (cached) {
        hasCatalogRef.current = true;
        setCatalogAt(cached.fetchedAt);
        etagRef.current = cached.etag;
        setItems(cached.items);
        setRefreshing(cached.refreshing);
        setSession("paired");
      }
      await loadLibrary(!!cached);
      if (!cancelled && cached?.refreshing && !catalogPollTimer.current) scheduleCatalogPoll();
    })();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (catalogPollTimer.current) clearTimeout(catalogPollTimer.current);
      if (progressFlushTimer.current) clearTimeout(progressFlushTimer.current);
    };
  }, [loadLibrary]);

  const pullRefresh = useCallback(async () => {
    await loadLibrary(true);
    // The offline flag lands on the next render.
    await new Promise((r) => window.setTimeout(r, 60));
    flash(offlineModeRef.current ? "Still can't reach your PC." : "Connected to your PC.");
  }, [loadLibrary, flash]);
  const pull = usePullToRefresh({
    scrollers: scrollRefs as RefObject<Record<string, HTMLElement | null>>,
    enabled: session === "paired",
    onRefresh: pullRefresh,
  });

  // Home screen apps resume from a frozen state; RuForge may have restarted meanwhile.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && sessionRef.current === "paired") void loadLibrary(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadLibrary]);

  useEffect(() => {
    if (session === "paired" && window.location.pathname !== "/paired") {
      window.history.replaceState(null, "", "/paired");
    }
  }, [session]);

  const flushProgress = useCallback(() => {
    const id = activeIdRef.current;
    const p = progressPending.current;
    if (!id || !p) return;
    progressPending.current = null;
    void recordProgress(id, p, true).then(() =>
      postProgress(id, p).then((ok) => (ok ? recordProgress(id, p, false) : undefined)),
    );
  }, []);

  const scheduleProgressFlush = useCallback(
    (position: number, dur: number, state: "playing" | "paused" | "ended") => {
      progressPending.current = { positionSecs: position, durationSecs: dur, playbackState: state };
      if (progressFlushTimer.current) return;
      progressFlushTimer.current = setTimeout(() => {
        progressFlushTimer.current = null;
        flushProgress();
      }, PROGRESS_DEBOUNCE_MS);
    },
    [flushProgress],
  );

  const getMediaElement = useCallback((): HTMLAudioElement | HTMLVideoElement | null => {
    return activeKindRef.current === "audio" ? audioRef.current : videoRef.current;
  }, []);

  const playsHereCb = useCallback((item: CompanionItem) => playsHere(item), []);

  const startStream = useCallback(
    async (item: CompanionItem, requestId: number, resumeAt: Promise<number> | number) => {
      const kind = itemMediaType(item);
      const el = kind === "audio" ? audioRef.current : videoRef.current;
      if (!el) return;
      const local = await offlineUrl(item.id);
      if (local && requestId !== playbackRequestRef.current) {
        URL.revokeObjectURL(local);
        return;
      }
      if (local) localUrlRef.current = local;
      if (!local && offlineModeRef.current) {
        setPlaybackError(NOT_SAVED_OFFLINE);
        return;
      }
      const url = local ?? (await fetchMediaUrl(item.id));
      if (requestId !== playbackRequestRef.current) return;
      if (!url) {
        setPlaybackError("Couldn't start this one. Check that RuForge is still open on your PC.");
        return;
      }
      el.src = url;
      el.playbackRate = readStoredSpeed();
      el.loop = readStoredLoop();
      void Promise.resolve(resumeAt).then((at) => {
        if (requestId !== playbackRequestRef.current || at <= 0) return;
        const seekTo = () => { el.currentTime = at; };
        if (el.readyState >= 1) seekTo();
        else el.addEventListener("loadedmetadata", seekTo, { once: true });
      });
      try {
        await el.play();
      } catch {
        if (requestId === playbackRequestRef.current) setPaused(true);
      }
    },
    [],
  );

  const playItem = useCallback(
    async (item: CompanionItem, list: CompanionItem[], context?: string) => {
      if (!playsHere(item)) return;
      if (offlineModeRef.current && !isSaved(item.id)) {
        setPlaybackError(NOT_SAVED_OFFLINE);
        return;
      }
      let nextPlaylist = list;
      if (context !== undefined) {
        setPlayContext(context);
        if (shuffleRef.current) {
          unshuffledRef.current = list;
          nextPlaylist = [item, ...shuffled(list.filter((i) => i.id !== item.id))];
        } else {
          unshuffledRef.current = null;
        }
      }
      const kind = itemMediaType(item);
      const currentEl = kind === "audio" ? audioRef.current : videoRef.current;
      if (activeIdRef.current === item.id && currentEl?.currentSrc) {
        setPlaylist(nextPlaylist);
        if (currentEl.paused) void currentEl.play().catch(() => setPaused(true));
        else setPlayerOpen(true);
        return;
      }

      const requestId = playbackRequestRef.current + 1;
      playbackRequestRef.current = requestId;
      flushProgress();
      // load() runs inside the tap so iOS lets the later async play() through.
      for (const el of [audioRef.current, videoRef.current]) {
        if (!el) continue;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      if (localUrlRef.current) {
        URL.revokeObjectURL(localUrlRef.current);
        localUrlRef.current = null;
      }

      activeIdRef.current = item.id;
      activeKindRef.current = kind;
      retriedRef.current = null;
      setPlaybackError(null);
      setClock(0);
      setDuration(0);
      setPaused(true);
      setSbSegments([]);
      setSpriteCount(0);
      setActiveId(item.id);
      setActiveKind(kind);
      setPlaylist(nextPlaylist);
      setRecentIds(pushRecent(item.id));
      if (kind === "video") setPlayerOpen(true);

      const resumeAt =
        kind === "video"
          ? Promise.all([fetchProgress(item.id), readLocalProgress(item.id)]).then(([remote, local]) => {
              const p = pickResume(local, remote);
              if (!p || p.positionSecs < RESUME_MIN_SECS) return 0;
              const dur = p.durationSecs || item.durationSecs || 0;
              return dur > 0 && p.positionSecs > dur - RESUME_TAIL_SECS ? 0 : p.positionSecs;
            })
          : 0;

      await startStream(item, requestId, resumeAt);

      if (readSettings().autosave && !isSaved(item.id) && !isSaving(item.id)) void startSave(item);

      const standalone =
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;
      if (!standalone) {
        // Waits out the first seconds of playback and never lands over fullscreen video.
        window.setTimeout(() => {
          if (!document.querySelector(".ph-player--fs")) requestIntro("install");
        }, 8000);
      }

      void fetchSidecar(item.id).then(async (fresh) => {
        if (fresh && isSaved(item.id)) void writeSidecar(item.id, fresh);
        const sidecar = fresh ?? (await readSidecar(item.id));
        if (requestId !== playbackRequestRef.current || !sidecar) return;
        setSbSegments(sidecar.sponsorSegments ?? []);
        setSpriteCount(sidecar.scrubSpriteCount ?? 0);
      });
    },
    [flushProgress, startStream],
  );

  const setShuffle = useCallback((on: boolean) => {
    shuffleRef.current = on;
    setShuffleState(on);
    const id = activeIdRef.current;
    if (on) {
      unshuffledRef.current = playlist;
      const current = playlist.find((i) => i.id === id);
      const rest = shuffled(playlist.filter((i) => i.id !== id));
      setPlaylist(current ? [current, ...rest] : rest);
    } else {
      const original = unshuffledRef.current;
      unshuffledRef.current = null;
      if (original) setPlaylist(original);
    }
  }, [playlist]);

  const playlistIndex = playlist.findIndex((i) => i.id === activeId);
  const hasNext = playlistIndex >= 0 && playlistIndex < playlist.length - 1;
  const pastIntro = useClockSelector((t) => t > 3);
  const hasPrev = playlistIndex > 0 || pastIntro;
  const upNext = useMemo(
    () => (playlistIndex >= 0 ? playlist.slice(playlistIndex + 1, playlistIndex + 31) : []),
    [playlist, playlistIndex],
  );

  // Waits so the token calls don't compete with the current item's first bytes.
  useEffect(() => {
    if (playlistIndex < 0) return;
    const id = window.setTimeout(() => {
      for (const near of [playlist[playlistIndex + 1], playlist[playlistIndex - 1]]) {
        if (near && playsHere(near)) void fetchMediaUrl(near.id);
      }
    }, 2500);
    return () => window.clearTimeout(id);
  }, [playlist, playlistIndex]);

  const skipNext = useCallback(() => {
    if (!hasNext) return;
    let at = playlistIndex + 1;
    if (offlineModeRef.current) {
      while (at < playlist.length && !isSaved(playlist[at]!.id)) at++;
      if (at >= playlist.length) {
        flash("No more saved songs in this list.");
        return;
      }
      if (at > playlistIndex + 1) flash(`Skipped ${at - playlistIndex - 1} not saved.`);
    }
    setTrackDir(1);
    void playItem(playlist[at]!, playlist);
  }, [flash, hasNext, playItem, playlist, playlistIndex]);

  const skipPrev = useCallback(() => {
    const el = getMediaElement();
    if (el && (el.currentTime > 3 || playlistIndex <= 0)) {
      el.currentTime = 0;
      return;
    }
    if (playlistIndex > 0) {
      setTrackDir(-1);
      void playItem(playlist[playlistIndex - 1]!, playlist);
    }
  }, [getMediaElement, playItem, playlist, playlistIndex]);

  const skipNextRef = useRef(skipNext);
  const skipPrevRef = useRef(skipPrev);
  useEffect(() => { skipNextRef.current = skipNext; }, [skipNext]);
  useEffect(() => { skipPrevRef.current = skipPrev; }, [skipPrev]);

  const togglePlay = useCallback(() => {
    const el = getMediaElement();
    if (!el || !el.currentSrc) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, [getMediaElement]);

  const seek = useCallback((t: number) => {
    const el = getMediaElement();
    if (el) el.currentTime = t;
    setClock(t);
  }, [getMediaElement]);

  const handleMediaError = useCallback(async (el: HTMLMediaElement) => {
    const id = activeIdRef.current;
    const item = items.find((i) => i.id === id);
    if (!id || !item) return;
    const requestId = playbackRequestRef.current;
    if (localUrlRef.current && el.currentSrc === localUrlRef.current) {
      setPaused(true);
      setPlaybackError("This saved copy won't play. Remove it and save it again.");
      return;
    }
    const lib = await fetchLibrary(etagRef.current);
    if (requestId !== playbackRequestRef.current) return;
    if (!lib.ok && lib.error.kind === "session") {
      setSession(sessionStateForAuthCode(lib.error.code ?? ""));
      return;
    }
    if (!lib.ok) {
      setPlaybackError("Lost the connection to your PC. Check that RuForge is open and Tailscale is on.");
      setPaused(true);
      return;
    }
    // Media errors hide the HTTP status, so ask the server directly.
    const status = await fetch(el.currentSrc, { headers: { Range: "bytes=0-0" }, cache: "no-store" })
      .then((r) => r.status)
      .catch(() => 0);
    if (requestId !== playbackRequestRef.current) return;
    const at = el.currentTime;
    if ((status === 403 || status === 410 || at > 0) && retriedRef.current !== id) {
      retriedRef.current = id;
      await startStream(item, requestId, at);
      return;
    }
    setPaused(true);
    if (status === 404) {
      setPlaybackError("This file is gone from your PC. It may have been moved or deleted.");
    } else if (status === 200 || status === 206) {
      setPlaybackError("This file won't play on this device.");
    } else {
      setPlaybackError("Playback stopped. Try it again.");
    }
  }, [items, startStream]);

  const mediaProps = useCallback(
    (kind: MediaMode) => {
      const mine = () => activeKindRef.current === kind;
      return {
        onPlay: () => { if (mine()) setPaused(false); },
        onPause: () => { if (mine()) setPaused(true); },
        onTimeUpdate: (e: SyntheticEvent<HTMLMediaElement>) => {
          if (!mine()) return;
          const el = e.currentTarget;
          const dur = Number.isFinite(el.duration) ? el.duration : 0;
          setClock(el.currentTime);
          if (dur) setDuration(dur);
          scheduleProgressFlush(el.currentTime, dur, el.paused ? "paused" : "playing");
        },
        onDurationChange: (e: SyntheticEvent<HTMLMediaElement>) => {
          if (mine() && Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        },
        onEnded: (e: SyntheticEvent<HTMLMediaElement>) => {
          if (!mine()) return;
          const el = e.currentTarget;
          scheduleProgressFlush(el.currentTime, Number.isFinite(el.duration) ? el.duration : 0, "ended");
          if (!el.loop && readSettings().autoplay) skipNextRef.current();
        },
        onError: (e: SyntheticEvent<HTMLMediaElement>) => {
          const el = e.currentTarget;
          if (!mine() || !el.getAttribute("src")) return;
          void handleMediaError(el);
        },
      };
    },
    [handleMediaError, scheduleProgressFlush],
  );

  const setLoop = useCallback((l: boolean) => {
    setLoopState(l);
    const el = getMediaElement();
    if (el) el.loop = l;
    writeLS(PLAYER_LOOP_KEY, l ? "1" : "0");
  }, [getMediaElement]);

  const changeSpeed = useCallback((next: number) => {
    setSpeedState(next);
    const el = getMediaElement();
    if (el) el.playbackRate = next;
    writeLS(PLAYER_SPEED_KEY, String(next));
  }, [getMediaElement]);

  const setSbEnabled = useCallback((e: boolean) => {
    setSbEnabledState(e);
    writeLS(PLAYER_SB_KEY, e ? "1" : "0");
  }, []);

  const activeSbSegment = useClockSelector((t) => {
    if (!sbEnabled) return null;
    return (
      sbSegments.find((s) => s.actionType === "skip" && t >= s.segment[0] && t < s.segment[1] - 0.25) ?? null
    );
  });

  const sbSkippedRef = useRef(new Set<string>());
  useEffect(() => { sbSkippedRef.current.clear(); }, [activeId]);
  useEffect(() => {
    if (!activeSbSegment) return;
    const key = activeSbSegment.UUID ?? `${activeSbSegment.segment[0]}-${activeSbSegment.segment[1]}`;
    if (sbSkippedRef.current.has(key)) return;
    sbSkippedRef.current.add(key);
    const el = getMediaElement();
    if (el) el.currentTime = activeSbSegment.segment[1];
  }, [activeSbSegment, getMediaElement]);

  const skipSbSegment = useCallback(() => {
    if (!activeSbSegment) return;
    const el = getMediaElement();
    if (el) el.currentTime = activeSbSegment.segment[1];
  }, [activeSbSegment, getMediaElement]);

  const activeItem = items.find((i) => i.id === activeId) ?? null;

  // Lock screen and Control Center controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try { ms.setActionHandler(action, handler); } catch {}
    };
    set("play", () => { void getMediaElement()?.play().catch(() => {}); });
    set("pause", () => { getMediaElement()?.pause(); });
    set("previoustrack", () => skipPrevRef.current());
    set("nexttrack", () => skipNextRef.current());
    set("seekto", (d) => { if (d.seekTime != null) seek(d.seekTime); });
  }, [getMediaElement, seek]);

  const { saved: savedIds, pending: pendingSaves, failed: failedSaves } = useOfflineState();
  useEffect(() => {
    const urls = items.filter((i) => i.hasThumb && savedIds.has(i.id)).map((i) => artUrl(i.id, i.thumbV));
    navigator.serviceWorker?.controller?.postMessage({ type: "art-pins", urls });
  }, [items, savedIds]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (!activeItem) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const base = { title: activeItem.title, artist: activeItem.artist ?? "RuForge", album: activeItem.album ?? "" };
    navigator.mediaSession.metadata = new MediaMetadata(base);
    if (!activeItem.hasThumb) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      ...base,
      artwork: [{
        src: new URL(artUrl(activeItem.id, activeItem.thumbV), window.location.origin).href,
        sizes: "256x256",
        type: "image/jpeg",
      }],
    });
  }, [activeItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = activeItem ? (paused ? "paused" : "playing") : "none";
    if (!activeItem || duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: speed,
        position: Math.min(getMediaElement()?.currentTime ?? 0, duration),
      });
    } catch {}
  }, [activeItem, paused, duration, speed, getMediaElement]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as Element;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      if (e.code === "Space" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePlay();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);

  const tint = useArtTint(activeItem);
  // Whatever shows above the sheet (the status bar strip) takes the cover tint while the sheet is up.
  useEffect(() => {
    const root = document.documentElement;
    if (tint) root.style.setProperty("--sheet-tint", tint.deep);
    else root.style.removeProperty("--sheet-tint");
  }, [tint]);

  const onTab = (next: Tab) => {
    if (next === tab && stack.length === 0) scrollRefs.current[next]?.scrollTo({ top: 0, behavior: "smooth" });
    // Marked non-urgent so the tab bar answers the finger before the page behind it re-renders.
    startTransition(() => {
      setStack([]);
      setTab(next);
    });
  };

  const openGroup = useCallback((group: Group) => setStack((s) => [...s, group]), []);
  const popPage = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const browseChip = useCallback((chip: LibraryChip) => {
    setLibChip(chip);
    setStack([]);
    setTab("library");
  }, []);
  const changeLibSort = useCallback((s: LibrarySort) => {
    setLibSortState(s);
    writeLS(LIB_SORT_KEY, s);
  }, []);
  const openSearch = useCallback(() => {
    setStack([]);
    setTab("search");
  }, []);
  const openArtistOf = useCallback(
    (item: CompanionItem) => {
      const key = artistKeyOf(item);
      const group = artistGroups(items.filter((i) => isAudio(i) && playsHere(i))).find((g) => g.key === `artist:${key}`);
      if (group) openGroup(group);
    },
    [items, openGroup],
  );

  const dockRef = useRef<HTMLElement>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDockH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [session]);

  const appHeight = useAppViewport();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ph-locked", session === "paired");
    return () => root.classList.remove("ph-locked");
  }, [session]);

  const playFrom = useCallback(
    (item: CompanionItem, list: CompanionItem[], context: string) => {
      setTrackDir(1);
      void playItem(item, list, context);
    },
    [playItem],
  );

  const shuffleFrom = useCallback(
    (list: CompanionItem[], context: string) => {
      const pick = list[Math.floor(Math.random() * list.length)];
      if (!pick) return;
      if (!shuffleRef.current) setShuffle(true);
      shuffleRef.current = true;
      void playItem(pick, list, context);
    },
    [playItem, setShuffle],
  );

  if (session !== "paired") {
    return (
      <GateCard
        session={session}
        onRetry={() => { void loadLibrary(); }}
        onPair={async (code) => {
          const paired = await pairWithCode(code);
          if (!paired.ok) return paired.error.kind === "network" ? "network" : "invalid";
          await loadLibrary();
          return null;
        }}
      />
    );
  }

  const view = (t: Tab) => ({
    ref: (el: HTMLDivElement | null) => { scrollRefs.current[t] = el; },
    className: "ph-scroll",
    hidden: tab !== t,
    initial: false,
    animate: tab === t ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 },
    transition: pageFadeTransition,
  });

  const videoMode = (tab === "home" && homeChip === "videos") || (tab === "library" && libChip === "videos");
  const shellStyle = {
    "--app-h": appHeight ? `${appHeight}px` : undefined,
    "--dock-h": `${dockH}px`,
    ...(tint ? { "--art-deep": tint.deep, "--art-mini": tint.mini } : {}),
  } as CSSProperties;

  return (
    <div className="ph-shell" data-mode={videoMode ? "videos" : "music"} style={shellStyle}>
      <audio ref={audioRef} preload="metadata" {...mediaProps("audio")} />

      <main className="ph-main">
        <m.div {...view("home")}>
          <HomeTab
            items={items}
            recentIds={recentIds}
            chip={homeChip}
            activeId={activeId}
            refreshing={refreshing}
            playsHere={playsHereCb}
            onChip={setHomeChip}
            onPlay={playFrom}
            onOpen={openGroup}
          />
        </m.div>
        <m.div {...view("search")}>
          <SearchView
            items={items}
            query={query}
            activeId={activeId}
            playsHere={playsHereCb}
            onQuery={setQuery}
            onPlay={playFrom}
            onOpen={openGroup}
            onBrowse={browseChip}
          />
        </m.div>
        <m.div {...view("library")}>
          <LibraryTab
            items={items}
            chip={libChip}
            sort={libSort}
            activeId={activeId}
            playsHere={playsHereCb}
            onChip={setLibChip}
            onSort={changeLibSort}
            onSearch={openSearch}
            onPlay={playFrom}
            onOpen={openGroup}
          />
        </m.div>
        <AnimatePresence initial={false}>
          {stack.map((group, depth) => (
            <DetailLayer key={`${depth}:${group.key}`} onBack={popPage}>
              <DetailPage
                group={group}
                allItems={items}
                activeId={activeId}
                paused={paused}
                playsHere={playsHereCb}
                onBack={popPage}
                onOpen={openGroup}
                onOpenArtist={openArtistOf}
                onPlay={playFrom}
                onShuffle={shuffleFrom}
                onTogglePlay={togglePlay}
              />
            </DetailLayer>
          ))}
        </AnimatePresence>
      </main>

      <span className="ph-statusfade" aria-hidden />
      <PullRing ringRef={pull.ringRef} phase={pull.phase} />
      <span className="ph-scrim" aria-hidden />

      <footer className="ph-dock" ref={dockRef}>
        {offlineMode ? (
          <button type="button" className="ph-offline-note" onClick={() => openIntro("offline")}>
            Offline. {catalogAt ? `Library from ${ago(catalogAt)}. ` : ""}
            {savedIds.size} saved.
          </button>
        ) : notice ? (
          <p className="ph-offline-note" role="status">{notice}</p>
        ) : null}
        {pendingSaves > 0 || failedSaves.size > 0 ? (
          <button type="button" className="ph-offline-note ph-dl-chip" onClick={() => openIntro("storage")}>
            {pendingSaves > 0 ? `Downloading ${pendingSaves} ${pendingSaves === 1 ? "item" : "items"}` : `${failedSaves.size} failed`}
          </button>
        ) : null}
        {playbackError && !playerOpen ? (
          <p className="ph-dock-error" role="alert">{playbackError}</p>
        ) : null}
        <AnimatePresence initial={false}>
          {activeItem ? (
            <NowPlayingBar
              key="mini"
              item={activeItem}
              paused={paused}
              duration={duration}
              hasNext={hasNext}
              direction={trackDir}
              onOpen={() => setPlayerOpen(true)}
              onTogglePlay={togglePlay}
              onNext={skipNext}
              onPrev={skipPrev}
              cardRef={miniRef}
            />
          ) : null}
        </AnimatePresence>
        <TabBar tab={tab} onTab={onTab} />
      </footer>

      <PlayerSheet
        open={playerOpen && activeItem !== null}
        item={activeItem}
        kind={activeKind}
        context={playContext}
        direction={trackDir}
        videoRef={videoRef}
        originRef={miniRef}
        videoProps={mediaProps("video")}
        paused={paused}
        duration={duration}
        loop={loop}
        shuffle={shuffle}
        speed={speed}
        speeds={PLAYBACK_SPEEDS}
        sbEnabled={sbEnabled}
        sbSegments={sbSegments}
        spriteCount={spriteCount}
        activeSbSegment={activeSbSegment}
        hasPrev={hasPrev}
        hasNext={hasNext}
        upNext={upNext}
        error={playbackError}
        onClose={() => setPlayerOpen(false)}
        onTogglePlay={togglePlay}
        onPrev={skipPrev}
        onNext={skipNext}
        onSeek={seek}
        onLoop={setLoop}
        onShuffle={setShuffle}
        onSpeed={changeSpeed}
        onSbEnabled={setSbEnabled}
        onSkipSegment={skipSbSegment}
        onOpenQueue={() => setQueueOpen(true)}
        onPlayQueued={(next) => {
          setTrackDir(1);
          void playItem(next, playlist);
        }}
      />

      <Intros />
      <QueueSheet
        open={queueOpen}
        playlist={playlist}
        activeId={activeId}
        onPlay={(item) => void playItem(item, playlist)}
        onClose={() => setQueueOpen(false)}
      />
    </div>
  );
}
