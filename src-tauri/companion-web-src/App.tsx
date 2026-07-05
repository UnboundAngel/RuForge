import { useCallback, useEffect, useRef, useState } from "react";
import "./styles.css";
import { GateCard } from "./components/GateCard";
import { LibraryView } from "./components/LibraryView";
import { NowPlayingBar } from "./components/NowPlayingBar";
import { QueueSidebar } from "./components/QueueSidebar";
import { LazyThumb } from "./components/LazyThumb";
import {
  checkHealth,
  fetchLibrary,
  pairWithCode,
  fetchSidecar,
  fetchStreamToken,
  postProgress,
} from "./api";
import {
  fmtDuration,
  itemMediaType,
  type CompanionItem,
  type MediaMode,
  type SessionState,
  type SponsorSegment,
} from "./types";

const PROGRESS_DEBOUNCE_MS = 8000;
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 30000;
const CATALOG_REFRESH_MAX_POLLS = 60;

const PLAYER_VOLUME_KEY = "rf_companion_player_volume";
const PLAYER_MUTED_KEY = "rf_companion_player_muted";
const PLAYER_SPEED_KEY = "rf_companion_player_speed";
const PLAYER_LOOP_KEY = "rf_companion_player_loop";
const PLAYER_SB_KEY = "rf_companion_sb_enabled";

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

function readStoredVolume() {
  const v = parseFloat(readLS(PLAYER_VOLUME_KEY, "1"));
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
function readStoredMuted() {
  return readLS(PLAYER_MUTED_KEY, "false") === "true";
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

export default function App() {
  // Session + library state
  const [session, setSession] = useState<SessionState>("loading");
  const [items, setItems] = useState<CompanionItem[]>([]);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [mode, setMode] = useState<MediaMode>("audio");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Playback state
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<MediaMode>("audio");
  const [playlist, setPlaylist] = useState<CompanionItem[]>([]);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [muted, setMutedState] = useState(readStoredMuted);
  const [loop, setLoopState] = useState(readStoredLoop);
  const [speed, setSpeedState] = useState(readStoredSpeed);
  const [sbEnabled, setSbEnabledState] = useState(readStoredSbEnabled);
  const [sbSegments, setSbSegments] = useState<SponsorSegment[]>([]);
  const [spriteCount, setSpriteCount] = useState(0);
  const [activeSbSegment, setActiveSbSegment] = useState<SponsorSegment | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Reconnect/catalog refs
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

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { activeKindRef.current = activeKind; }, [activeKind]);

  // Load library on mount + handle session state
  const loadLibrary = useCallback(async (silent = false) => {
    if (!silent) setSession("loading");
    let result = await fetchLibrary();
    if (!result.ok) {
      const code = result.error.code ?? "";
      const pairingCode = readPairingCode();
      if (pairingCode && result.error.kind === "session") {
        const paired = await pairWithCode(pairingCode);
        if (!paired.ok) {
          const pairCode = paired.error.code ?? "invalid_pairing_code";
          if (paired.error.kind === "network") {
            setSession("disconnected");
            scheduleReconnect();
          } else {
            setSession(sessionStateForAuthCode(pairCode));
          }
          return;
        }
        result = await fetchLibrary();
      }
    }
    if (!result.ok) {
      const code = result.error.code ?? "";
      if (result.error.kind === "session" || SESSION_ERRORS.has(code) || SESSION_GATE_CODES.has(code)) {
        setSession(sessionStateForAuthCode(code));
      } else {
        setSession("disconnected");
        scheduleReconnect();
      }
      return;
    }
    reconnectDelay.current = RECONNECT_BASE_MS;
    setItems(result.data.items ?? []);
    setSession("paired");
    if (result.data.catalogRefreshing) {
      setCatalogRefreshing(true);
      scheduleCatalogPoll();
    } else {
      setCatalogRefreshing(false);
      catalogPollCount.current = 0;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        reconnectDelay.current = Math.min(
          reconnectDelay.current * 1.5,
          RECONNECT_MAX_MS,
        );
        scheduleReconnect();
      }
    }, reconnectDelay.current);
  }

  function scheduleCatalogPoll() {
    if (catalogPollTimer.current) clearTimeout(catalogPollTimer.current);
    catalogPollCount.current += 1;
    if (catalogPollCount.current > CATALOG_REFRESH_MAX_POLLS) {
      setCatalogRefreshing(false);
      return;
    }
    catalogPollTimer.current = setTimeout(async () => {
      const result = await fetchLibrary();
      if (result.ok) {
        setItems(result.data.items ?? []);
        if (result.data.catalogRefreshing) {
          scheduleCatalogPoll();
        } else {
          setCatalogRefreshing(false);
          catalogPollCount.current = 0;
        }
      }
    }, 3000);
  }

  useEffect(() => {
    void loadLibrary();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (catalogPollTimer.current) clearTimeout(catalogPollTimer.current);
      if (progressFlushTimer.current) clearTimeout(progressFlushTimer.current);
    };
  }, [loadLibrary]);

  // Normalize URL to /paired after first successful session (SPA fallback)
  useEffect(() => {
    if (session === "paired" && window.location.pathname !== "/paired") {
      window.history.replaceState(null, "", "/paired");
    }
  }, [session]);

  // Flush progress
  const flushProgress = useCallback(() => {
    const id = activeIdRef.current;
    const p = progressPending.current;
    if (!id || !p) return;
    progressPending.current = null;
    void postProgress(id, p);
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

  // Wire audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => { if (activeKindRef.current === "audio") setPaused(false); };
    const onPause = () => { if (activeKindRef.current === "audio") setPaused(true); };
    const onTimeUpdate = () => {
      if (activeKindRef.current !== "audio") return;
      const ct = audio.currentTime;
      const dur = audio.duration;
      setCurrentTime(ct);
      if (Number.isFinite(dur)) setDuration(dur);
      scheduleProgressFlush(ct, Number.isFinite(dur) ? dur : 0, audio.paused ? "paused" : "playing");
    };
    const onDurationChange = () => {
      if (activeKindRef.current !== "audio") return;
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onVolumeChange = () => {
      writeLS(PLAYER_VOLUME_KEY, String(audio.volume));
      writeLS(PLAYER_MUTED_KEY, audio.muted ? "true" : "false");
    };
    const onEnded = () => {
      if (activeKindRef.current !== "audio") return;
      scheduleProgressFlush(audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : 0, "ended");
      if (!audio.loop) skipNext();
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("volumechange", onVolumeChange);
    audio.addEventListener("ended", onEnded);

    // Restore stored output
    audio.volume = readStoredVolume();
    audio.muted = readStoredMuted();

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("volumechange", onVolumeChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire video element events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { if (activeKindRef.current === "video") setPaused(false); };
    const onPause = () => { if (activeKindRef.current === "video") setPaused(true); };
    const onTimeUpdate = () => {
      if (activeKindRef.current !== "video") return;
      const ct = video.currentTime;
      const dur = video.duration;
      setCurrentTime(ct);
      if (Number.isFinite(dur)) setDuration(dur);
      scheduleProgressFlush(ct, Number.isFinite(dur) ? dur : 0, video.paused ? "paused" : "playing");
    };
    const onDurationChange = () => {
      if (activeKindRef.current !== "video") return;
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onEnded = () => {
      if (activeKindRef.current !== "video") return;
      scheduleProgressFlush(video.currentTime, Number.isFinite(video.duration) ? video.duration : 0, "ended");
      if (!video.loop) skipNext();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("loadedmetadata", onDurationChange);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("loadedmetadata", onDurationChange);
      video.removeEventListener("ended", onEnded);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track active SB segment
  useEffect(() => {
    if (!sbEnabled || sbSegments.length === 0) {
      setActiveSbSegment(null);
      return;
    }
    const active = sbSegments.find(
      (s) =>
        s.actionType === "skip" &&
        currentTime >= s.segment[0] &&
        currentTime < s.segment[1] - 0.25,
    );
    setActiveSbSegment(active ?? null);
  }, [currentTime, sbSegments, sbEnabled]);

  // Auto-skip SB segments
  const sbSkippedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!sbEnabled || !activeSbSegment) return;
    const key = activeSbSegment.UUID ?? `${activeSbSegment.segment[0]}-${activeSbSegment.segment[1]}`;
    if (sbSkippedRef.current.has(key)) return;
    sbSkippedRef.current.add(key);
    const el = getMediaElement();
    if (el) el.currentTime = activeSbSegment.segment[1];
  }, [sbEnabled, activeSbSegment]);

  // Reset SB skip set on track change
  useEffect(() => {
    sbSkippedRef.current.clear();
  }, [activeId]);

  function getMediaElement(): HTMLAudioElement | HTMLVideoElement | null {
    return activeKindRef.current === "audio" ? audioRef.current : videoRef.current;
  }

  function stopElement(el: HTMLAudioElement | HTMLVideoElement | null) {
    if (!el) return;
    el.pause();
    el.removeAttribute("src");
    el.load();
  }

  const playItem = useCallback(
    async (item: CompanionItem, nextPlaylist: CompanionItem[]) => {
      if (!item.playable) return;

      const kind = itemMediaType(item);
      const requestId = playbackRequestRef.current + 1;
      playbackRequestRef.current = requestId;

      const currentEl = kind === "audio" ? audioRef.current : videoRef.current;
      if (activeIdRef.current === item.id && activeKindRef.current === kind && currentEl?.currentSrc) {
        setPlaylist(nextPlaylist);
        if (currentEl.paused) void currentEl.play().catch(() => setPaused(true));
        return;
      }

      flushProgress();
      stopElement(audioRef.current);
      stopElement(videoRef.current);

      activeIdRef.current = item.id;
      activeKindRef.current = kind;
      setPlaybackError(null);
      setCurrentTime(0);
      setDuration(0);
      setPaused(true);
      setSbSegments([]);
      setSpriteCount(0);
      setActiveSbSegment(null);
      setActiveId(item.id);
      setActiveKind(kind);
      setMode(kind);
      setPlaylist(nextPlaylist);

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (requestId !== playbackRequestRef.current) return;

      const el = kind === "audio" ? audioRef.current : videoRef.current;
      if (!el) {
        setPlaybackError("Playback target was not ready. Try selecting the item again.");
        return;
      }

      const result = await fetchStreamToken(item.id);
      if (requestId !== playbackRequestRef.current) return;
      if (!result) {
        setPlaybackError("Could not get stream token. Try again.");
        return;
      }

      el.src = result;
      el.playbackRate = readStoredSpeed();
      el.loop = readStoredLoop();
      el.volume = readStoredVolume();
      el.muted = readStoredMuted();

      el.onerror = () => {
        if (requestId !== playbackRequestRef.current) return;
        const code =
          el.error?.message?.toLowerCase().includes("session")
            ? "session"
            : "stream";
        if (code === "session") {
          setSession("session-lost");
        } else {
          setPlaybackError("Playback failed. The stream may have expired. Try selecting the item again.");
        }
      };

      try {
        await el.play();
        if (requestId === playbackRequestRef.current) setPaused(false);
      } catch {
        if (requestId === playbackRequestRef.current) setPaused(true);
      }

      void fetchSidecar(item.id).then((sidecar) => {
        if (requestId !== playbackRequestRef.current || !sidecar) return;
        setSbSegments(sidecar.sbSegments ?? []);
        setSpriteCount(sidecar.scrubSpriteCount ?? 0);
      });
    },
    [flushProgress],
  );

  const togglePlay = useCallback(() => {
    const el = getMediaElement();
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = useCallback((t: number) => {
    const el = getMediaElement();
    if (el) el.currentTime = t;
    setCurrentTime(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seekStart = useCallback(() => {
    getMediaElement()?.pause();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const skipNext = useCallback(() => {
    if (!activeId || playlist.length === 0) return;
    const idx = playlist.findIndex((i) => i.id === activeId);
    if (idx < 0 || idx >= playlist.length - 1) return;
    const next = playlist[idx + 1]!;
    void playItem(next, playlist);
  }, [activeId, playlist, playItem]);

  const skipPrev = useCallback(() => {
    const el = getMediaElement();
    if (!activeId || playlist.length === 0) {
      if (el) el.currentTime = 0;
      return;
    }
    const idx = playlist.findIndex((i) => i.id === activeId);
    if (idx > 0 && el && el.currentTime <= 3) {
      void playItem(playlist[idx - 1]!, playlist);
    } else if (el) {
      el.currentTime = 0;
    }
  }, [activeId, playlist, playItem, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    const el = getMediaElement();
    if (el) el.volume = v;
    writeLS(PLAYER_VOLUME_KEY, String(v));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    const el = getMediaElement();
    if (el) el.muted = m;
    writeLS(PLAYER_MUTED_KEY, m ? "true" : "false");
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLoop = useCallback((l: boolean) => {
    setLoopState(l);
    const el = getMediaElement();
    if (el) el.loop = l;
    writeLS(PLAYER_LOOP_KEY, l ? "1" : "0");
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSpeed = useCallback((s: number) => {
    setSpeedState(s);
    const el = getMediaElement();
    if (el) el.playbackRate = s;
    writeLS(PLAYER_SPEED_KEY, String(s));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSbEnabled = useCallback((e: boolean) => {
    setSbEnabledState(e);
    writeLS(PLAYER_SB_KEY, e ? "1" : "0");
  }, []);

  const skipSbSegment = useCallback(() => {
    if (!activeSbSegment) return;
    const el = getMediaElement();
    if (el) el.currentTime = activeSbSegment.segment[1];
    setActiveSbSegment(null);
  }, [activeSbSegment, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeItem = items.find((i) => i.id === activeId) ?? null;
  const playlistIndex = playlist.findIndex((i) => i.id === activeId);
  const hasPrev = playlistIndex > 0 || currentTime > 3;
  const hasNext = playlistIndex >= 0 && playlistIndex < playlist.length - 1;

  // Search filter
  const searchLower = searchQuery.toLowerCase();
  const searchResults = searchQuery.length >= 2
    ? items.filter(
        (i) =>
          i.title.toLowerCase().includes(searchLower) ||
          (i.artist ?? "").toLowerCase().includes(searchLower) ||
          (i.album ?? "").toLowerCase().includes(searchLower),
      )
    : [];

  const audioItems = items.filter((i) => itemMediaType(i) === "audio");
  const videoItems = items.filter((i) => itemMediaType(i) === "video");

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as Element;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;

      if (e.code === "Space" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [togglePlay]);

  if (session !== "paired") {
    return (
      <GateCard
        session={session}
        onRetry={() => { void loadLibrary(); }}
      />
    );
  }

  return (
    <div className="shell">
      {/* Hidden audio + video elements */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* Search overlay */}
      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-box" onClick={(e) => e.stopPropagation()}>
            <div className="search-input-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--music-text-muted)", flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Search songs, artists, albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} style={{ color: "var(--music-text-muted)", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="search-results">
              {searchQuery.length < 2 && (
                <div style={{ padding: "16px", fontSize: 13, color: "var(--music-text-muted)", textAlign: "center" }}>
                  Type to search...
                </div>
              )}
              {searchResults.map((item, i) => (
                <div
                  key={item.id}
                  className={`song-row ${item.id === activeId ? "active" : ""}`}
                  style={{ padding: "8px 16px" }}
                  onClick={() => {
                    if (item.playable) {
                      void playItem(item, searchResults);
                      setSearchOpen(false);
                      setSearchQuery("");
                    }
                  }}
                >
                  <div className="song-index" />
                  <LazyThumb id={item.id} hasThumb={item.hasThumb} className="song-thumb">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--music-text-muted)" }}>
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </LazyThumb>
                  <div className="song-text">
                    <div className="song-title">{item.title}</div>
                    {item.artist && <div className="song-artist">{item.artist}</div>}
                  </div>
                  <div className="song-duration" style={{ color: "var(--music-text-muted)", fontSize: 11 }}>
                    {itemMediaType(item) === "audio" ? "Song" : "Video"}
                  </div>
                </div>
              ))}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <div style={{ padding: "16px", fontSize: 13, color: "var(--music-text-muted)", textAlign: "center" }}>
                  No results for "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="shell-body">
        {/* Sidebar */}
        <div className="shell-sidebar">
          <SideNav
            mode={mode}
            onModeChange={setMode}
            onSearchOpen={() => setSearchOpen(true)}
            audioCount={audioItems.length}
            videoCount={videoItems.length}
          />
        </div>

        {/* Main content */}
        <div className="shell-main">
          {playbackError && (
            <div className="playback-error">{playbackError}</div>
          )}
          {catalogRefreshing && (
            <div className="catalog-notice">Refreshing library...</div>
          )}

          {mode === "audio" ? (
            <LibraryView
              items={audioItems}
              activeId={activeId}
              onPlay={(item, list) => void playItem(item, list)}
            />
          ) : (
            <VideoView
              items={videoItems}
              activeId={activeId}
              videoRef={videoRef}
              paused={paused}
              currentTime={currentTime}
              duration={duration}
              sbSegments={sbSegments}
              spriteCount={spriteCount}
              activeSbSegment={activeSbSegment}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPlay={(item) => void playItem(item, videoItems)}
              onTogglePlay={togglePlay}
              onSkipPrev={skipPrev}
              onSkipNext={skipNext}
              onSeekStart={seekStart}
              onSeek={seek}
              onSkipSegment={skipSbSegment}
            />
          )}
        </div>

        {/* Right panel (queue) */}
        <div className={`shell-right-panel ${rightPanelOpen ? "" : "closed"}`}>
          {rightPanelOpen && (
            <QueueSidebar
              items={mode === "audio" ? audioItems : videoItems}
              activeId={activeId}
              onPlay={(item) => void playItem(item, mode === "audio" ? audioItems : videoItems)}
              onClose={() => setRightPanelOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Now playing bar */}
      {activeItem && (
        <NowPlayingBar
          item={activeItem}
          paused={paused}
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          muted={muted}
          loop={loop}
          speed={speed}
          sbEnabled={sbEnabled}
          sbSegments={sbSegments}
          spriteCount={spriteCount}
          activeSbSegment={activeSbSegment}
          hasPrev={hasPrev}
          hasNext={hasNext}
          rightPanelOpen={rightPanelOpen}
          onTogglePlay={togglePlay}
          onSkipPrev={skipPrev}
          onSkipNext={skipNext}
          onSeekStart={seekStart}
          onSeek={seek}
          onVolume={setVolume}
          onMuted={setMuted}
          onLoop={setLoop}
          onSpeed={setSpeed}
          onSbEnabled={setSbEnabled}
          onSkipSegment={skipSbSegment}
          onToggleQueue={() => setRightPanelOpen((o) => !o)}
        />
      )}
    </div>
  );
}

// Sidebar navigation component
function SideNav({
  mode,
  onModeChange,
  onSearchOpen,
  audioCount,
  videoCount,
}: {
  mode: MediaMode;
  onModeChange: (m: MediaMode) => void;
  onSearchOpen: () => void;
  audioCount: number;
  videoCount: number;
}) {
  return (
    <nav className="sidebar-nav">
      <div className="nav-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>RuForge</span>
      </div>

      <button
        type="button"
        className={`nav-item ${mode === "audio" ? "active" : ""}`}
        onClick={() => onModeChange("audio")}
      >
        <span className="nav-dot" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <span>Songs</span>
        {audioCount > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--music-text-muted)" }}>
            {audioCount}
          </span>
        )}
      </button>

      <button
        type="button"
        className={`nav-item ${mode === "video" ? "active" : ""}`}
        onClick={() => onModeChange("video")}
      >
        <span className="nav-dot" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
        </svg>
        <span>Videos</span>
        {videoCount > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--music-text-muted)" }}>
            {videoCount}
          </span>
        )}
      </button>

      <button
        type="button"
        className="sidebar-search-btn"
        onClick={onSearchOpen}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search</span>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.5 }}>f</span>
      </button>
    </nav>
  );
}

// Video view: grid of cards + inline video player
function VideoView({
  items,
  activeId,
  videoRef,
  paused,
  currentTime,
  duration,
  sbSegments,
  spriteCount,
  activeSbSegment,
  hasPrev,
  hasNext,
  onPlay,
  onTogglePlay,
  onSkipPrev,
  onSkipNext,
  onSeekStart,
  onSeek,
  onSkipSegment,
}: {
  items: CompanionItem[];
  activeId: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  paused: boolean;
  currentTime: number;
  duration: number;
  sbSegments: SponsorSegment[];
  spriteCount: number;
  activeSbSegment: SponsorSegment | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPlay: (item: CompanionItem) => void;
  onTogglePlay: () => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  onSeekStart: () => void;
  onSeek: (t: number) => void;
  onSkipSegment: () => void;
}) {
  const activeItem = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="video-shell">
      {activeItem && (
        <div className="video-wrap" style={{ flex: "0 0 auto", maxHeight: "50vh" }}>
          <video
            ref={videoRef}
            style={{ maxHeight: "50vh", width: "100%", display: "block", background: "#000" }}
          />
        </div>
      )}
      {!activeItem && (
        <video ref={videoRef} style={{ display: "none" }} />
      )}

      {activeItem && (
        <div style={{ padding: "8px 16px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--music-text-primary)", marginBottom: 2 }}>
            {activeItem.title}
          </div>
          {activeSbSegment && (
            <button
              type="button"
              className="skip-segment-btn"
              onClick={onSkipSegment}
              style={{ position: "static", margin: "6px 0" }}
            >
              Skip
            </button>
          )}
          <div style={{ marginTop: 8 }}>
            <ScrubBarWrap
              duration={duration}
              currentTime={currentTime}
              activeId={activeId}
              spriteCount={spriteCount}
              sbSegments={sbSegments}
              onSeekStart={onSeekStart}
              onSeek={onSeek}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onSkipPrev} disabled={!hasPrev && currentTime <= 3} style={{ color: "var(--music-text-secondary)", opacity: (!hasPrev && currentTime <= 3) ? 0.3 : 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--music-text-primary)", color: "var(--music-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              {paused
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              }
            </button>
            <button type="button" onClick={onSkipNext} disabled={!hasNext} style={{ color: "var(--music-text-secondary)", opacity: !hasNext ? 0.3 : 0.7 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <span style={{ fontSize: 12, color: "var(--music-text-muted)", marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>
              {fmtDuration(currentTime)} / {duration > 0 ? fmtDuration(duration) : "0:00"}
            </span>
          </div>
        </div>
      )}

      <div className="content-scroll" style={{ paddingTop: 8 }}>
        {items.length === 0 && (
          <div className="empty-state">No videos found</div>
        )}
        <div className="video-grid">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              item={item}
              active={item.id === activeId}
              onClick={() => { if (item.playable) onPlay(item); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Minimal ScrubBar wrapper for the video view (avoids importing full ScrubBar cycle)
import { ScrubBar } from "./components/ScrubBar";
function ScrubBarWrap(props: {
  duration: number; currentTime: number; activeId: string | null;
  spriteCount: number; sbSegments: SponsorSegment[];
  onSeekStart: () => void; onSeek: (t: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <ScrubBar
      duration={props.duration}
      currentTime={props.currentTime}
      activeId={props.activeId}
      spriteCount={props.spriteCount}
      sbSegments={props.sbSegments}
      dragging={dragging}
      onSeekStart={() => { setDragging(true); props.onSeekStart(); }}
      onSeek={(t) => { setDragging(false); props.onSeek(t); }}
    />
  );
}

function VideoCard({ item, active, onClick }: { item: CompanionItem; active: boolean; onClick: () => void }) {
  return (
    <div
      className={`video-card ${active ? "active" : ""} ${!item.playable ? "unsupported" : ""}`}
      onClick={onClick}
      style={{ cursor: item.playable ? "pointer" : "not-allowed" }}
    >
      <LazyThumb id={item.id} hasThumb={item.hasThumb} className="video-card-art">
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--music-text-muted)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
          </svg>
        </div>
      </LazyThumb>
      <div className="video-card-title">{item.title}</div>
      {item.durationSecs != null && item.durationSecs > 0 && (
        <div className="video-card-meta">{fmtDuration(item.durationSecs)}</div>
      )}
    </div>
  );
}
