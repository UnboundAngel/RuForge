import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  createContext,
  useContext,
  Fragment,
} from 'react';
import {
  animate,
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Bug,
  ChevronDown,
  Download,
  Minus,
  Paintbrush,
  Play,
  Plus,
  Search,
  Settings2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { DOWNLOAD_AUDIO_FORMAT_OPTIONS } from '../downloadFormat';
import { DOWNLOAD_SUBTITLE_LANG_PRESETS, downloadSubtitleLangLabel, CUSTOM_CONCURRENT_DOWNLOADS_MIN, DEFAULT_MAX_CONCURRENT_DOWNLOADS, MAX_CONCURRENT_DOWNLOADS_CAP } from '../store/types';
import type { SettingsTab } from '../store/types';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { emit } from "@tauri-apps/api/event";
import {
  requestDiscordOnboardingPreview,
  requestReplayOnboardingPreview,
} from "../lib/onboardingDebugPreview";
import { galleryScanRootsFromStore, normalizeScanDirKey } from '../lib/libraryConfig';
import { useRuforgeStore } from '../store/ruforgeStore';
import {
  clearLastDownloadBatchRecord,
  formatLastBatchSummary,
  getDevReplayMode,
  readLastDownloadBatchRecord,
  setDevReplayMode,
  type DevReplayMode,
} from '../lib/devLastDownloadBatch';
import { SponsorBlockSettingsTree } from './settings/SponsorBlockSettingsTree';
import { DebugLogCategoryTree } from './settings/DebugLogCategoryTree';
import { SettingsDescription } from './settings/settingsDescription';
import { RegroupPlaylistModal } from './RegroupPlaylistModal';
import { MigrateLibraryModal } from './MigrateLibraryModal';
import { MusicMetaBackfillModal } from './MusicMetaBackfillModal';
import { DevCapturesSection } from './dev-captures/DevCapturesSection';
import { CompanionSettingsSection } from './settings/CompanionSettingsSection';
import { useYtdlpUpdate } from '../hooks/useYtdlpUpdate';
import { useDenoStatus } from '../hooks/useDenoStatus';
import { buildEntireLibraryExportPreset } from '../lib/exportSelection';
import { OVERLAY_Z_CLASS } from '../lib/overlayZIndex';
import { cn } from '../lib/utils';
import { IconPillTooltip } from './ui/IconPillTooltip';
import { MORPH_SPRING } from './ui/Morph';

/** Compact chrome rim; thinner than the sticky icon bar (~36px). */
const SETTINGS_SHELL_PAD_PX = 7;

type SettingsNavItem = {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
};

type SettingsNavGroup = {
  label: string;
  items: readonly SettingsNavItem[];
};

const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    label: "Preferences",
    items: [
      { id: "general", label: "General", icon: Settings2 },
      { id: "appearance", label: "Appearance", icon: Paintbrush },
    ],
  },
  {
    label: "Library",
    items: [
      { id: "downloads", label: "Downloads", icon: Download },
      { id: "playback", label: "Playback", icon: Play },
    ],
  },
  {
    label: "System",
    items: [
      { id: "advanced", label: "Advanced", icon: Wrench },
      { id: "debugging", label: "Debugging", icon: Bug },
    ],
  },
];

const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  general: "General",
  downloads: "Downloads",
  playback: "Playback",
  appearance: "Appearance",
  advanced: "Advanced",
  debugging: "Debugging",
};

type SettingsSearchCtx = {
  query: string;
  /** Section title/keywords matched: show every child row. */
  forceShow: boolean;
};

const SettingsSearchRootContext = createContext("");
const SettingsSearchContext = createContext<SettingsSearchCtx>({
  query: "",
  forceShow: false,
});

function settingsTextMatches(query: string, ...parts: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return parts.some((part) => part.toLowerCase().includes(q));
}

interface SettingItemProps {
  title: string;
  description: string;
  control?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

const SettingsSectionHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="rf-settings-section-header">{children}</h3>
);

const SettingsSection: React.FC<{
  title: string;
  keywords?: string;
  children: React.ReactNode;
}> = ({ title, keywords = "", children }) => {
  const query = useContext(SettingsSearchRootContext);
  const forceShow = settingsTextMatches(query, title, keywords);
  return (
    <SettingsSearchContext.Provider value={{ query, forceShow }}>
      <section className="rf-settings-section">
        <SettingsSectionHeader>{title}</SettingsSectionHeader>
        <div className="rf-settings-section-body">{children}</div>
      </section>
    </SettingsSearchContext.Provider>
  );
};

interface CustomSelectProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-4 px-4 py-2.5 bg-[#1D1613] hover:bg-stone-800 cursor-pointer shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 transition-all min-w-[160px] ${
          isOpen ? 'rounded-t-xl border-b-0' : 'rounded-xl'
        }`}
      >
        <span className="text-[10px] font-black tracking-widest text-stone-300">{value.toUpperCase()}</span>
        <ChevronDown className={`w-3 h-3 text-stone-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, pointerEvents: "none" }}
            className="absolute top-full left-0 right-0 z-50 bg-[#1D1613] border border-white/5 border-t-0 rounded-b-xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.6)] pointer-events-auto"
          >
            {options.map((opt) => (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`px-4 py-3 text-[10px] font-black tracking-widest cursor-pointer transition-colors border-t border-white/[0.03] ${
                  value === opt ? 'bg-[color:var(--accent)] text-[#1D1613]' : 'text-stone-400 hover:bg-white/5'
                }`}
              >
                {opt.toUpperCase()}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Presets + custom; dropdown trigger label + concurrency stepper live in Downloads settings. */
type ConcurrentDownloadPresetId = "seq" | "mild" | "high" | "custom";

function concurrentDownloadPresetId(concurrency: number): ConcurrentDownloadPresetId {
  if (concurrency === 1) return "seq";
  if (concurrency === 2) return "mild";
  if (concurrency === 3) return "high";
  return "custom";
}

const BATCH_START_DELAY_OPTIONS: ReadonlyArray<{ label: string; ms: number }> = [
  { label: "Off", ms: 0 },
  { label: "0.5 s", ms: 500 },
  { label: "1 s", ms: 1000 },
  { label: "2 s", ms: 2000 },
  { label: "3 s", ms: 3000 },
  { label: "5 s", ms: 5000 },
];

function batchStartDelayLabel(ms: number): string {
  return BATCH_START_DELAY_OPTIONS.find((o) => o.ms === ms)?.label ?? "Off";
}

function concurrentDownloadTriggerTitle(
  concurrency: number,
  preset: ConcurrentDownloadPresetId,
): string {
  switch (preset) {
    case "seq":
      return "SEQUENTIAL (1)";
    case "mild":
      return "MILD PARALLEL (2)";
    case "high":
      return "HIGHER (3)";
    default:
      return `CUSTOM (${concurrency})`;
  }
}

interface MaxConcurrentDownloadsControlProps {
  concurrency: number;
  onConcurrencyChange: (n: number) => void | Promise<void>;
}

const PRESET_ROWS: ReadonlyArray<{
  id: Exclude<ConcurrentDownloadPresetId, "custom">;
  n: 1 | 2 | 3;
  title: string;
  hint: string;
  recommended?: boolean;
}> = [
  {
    id: "seq",
    n: 1,
    title: "Sequential",
    hint: "Downloads one video at a time. Best for avoiding rate-limiting.",
    recommended: true,
  },
  {
    id: "mild",
    n: 2,
    title: "Mild parallel",
    hint: "Downloads two videos at a time. Better for avoiding rate-limiting while reducing overall download time.",
  },
  {
    id: "high",
    n: 3,
    title: "Higher parallel",
    hint: "Downloads three videos at a time. Faster for larger batches, but at a higher risk of rate-limiting.",
  },
];

const MaxConcurrentDownloadsControl: React.FC<MaxConcurrentDownloadsControlProps> = ({
  concurrency,
  onConcurrencyChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const preset = concurrentDownloadPresetId(concurrency);
  const triggerTitle = concurrentDownloadTriggerTitle(concurrency, preset);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const applyPresetChoice = (id: ConcurrentDownloadPresetId) => {
    if (id === "custom") {
      void onConcurrencyChange(
        preset === "custom" ? concurrency : CUSTOM_CONCURRENT_DOWNLOADS_MIN,
      );
    } else {
      const row = PRESET_ROWS.find((r) => r.id === id);
      if (row) void onConcurrencyChange(row.n);
    }
    setIsOpen(false);
  };

  const bumpCustom = (delta: number) => {
    let next = concurrency + delta;
    if (next < CUSTOM_CONCURRENT_DOWNLOADS_MIN) {
      next = 3;
    }
    next = Math.min(MAX_CONCURRENT_DOWNLOADS_CAP, Math.max(1, next));
    void onConcurrencyChange(next);
  };

  const isRecommendedDefault = concurrency === DEFAULT_MAX_CONCURRENT_DOWNLOADS;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="relative" ref={containerRef}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`flex min-w-[200px] max-w-[240px] flex-col gap-1 rounded-xl border border-white/5 bg-[#1D1613] px-4 py-2.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] transition-all hover:bg-stone-800 ${
            isOpen ? "rounded-b-none border-b-0" : ""
          } cursor-pointer`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black tracking-widest text-stone-300">
              {triggerTitle}
            </span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-stone-500 transition-transform duration-300 ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>
          {isRecommendedDefault && (
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-stone-500">
              Recommended default
            </span>
          )}
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, pointerEvents: "none" }}
              className="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-xl border border-t-0 border-white/5 bg-[#1D1613] shadow-[0_15px_30px_rgba(0,0,0,0.6)] pointer-events-auto"
            >
              {PRESET_ROWS.map((row) => {
                const sel = preset === row.id;
                return (
                  <div
                    key={row.id}
                    onClick={() => applyPresetChoice(row.id)}
                    className={`cursor-pointer border-t border-white/[0.03] px-4 py-3 transition-colors ${
                      sel
                        ? "bg-[color:var(--accent)] text-[#1D1613]"
                        : "hover:bg-white/5 text-stone-400"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black tracking-widest">{row.title.toUpperCase()}</span>
                      {row.recommended && (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            sel
                              ? "border-[#1D1613]/35 text-[#1D1613]/90"
                              : "border-[color-mix(in_srgb,var(--accent),transparent_55%)] text-[color:var(--accent)]"
                          }`}
                        >
                          Recommended
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-1 text-[9px] font-medium leading-relaxed tracking-wide ${
                        sel ? "text-[#1D1613]/80" : "text-stone-500"
                      }`}
                    >
                      {row.hint}
                    </p>
                  </div>
                );
              })}
              <div
                onClick={() => applyPresetChoice("custom")}
                className={`cursor-pointer border-t border-white/[0.03] px-4 py-3 transition-colors ${
                  preset === "custom"
                    ? "bg-[color:var(--accent)] text-[#1D1613]"
                    : "hover:bg-white/5 text-stone-400"
                }`}
              >
                <div className="text-[10px] font-black tracking-widest">CUSTOM</div>
                <p
                  className={`mt-1 text-[9px] font-medium leading-relaxed tracking-wide ${
                    preset === "custom" ? "text-[#1D1613]/80" : "text-stone-500"
                  }`}
                >
                  Pick {CUSTOM_CONCURRENT_DOWNLOADS_MIN}–{MAX_CONCURRENT_DOWNLOADS_CAP} concurrent downloads (capped).
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {preset === "custom" && (
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-[#1D1613] px-2 py-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
          <button
            type="button"
            aria-label="Decrease concurrent downloads"
            onClick={() => bumpCustom(-1)}
            disabled={concurrency <= 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--accent)] transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[1.75rem] text-center text-[11px] font-black tabular-nums text-stone-100">
            {concurrency}
          </span>
          <button
            type="button"
            aria-label="Increase concurrent downloads"
            onClick={() => bumpCustom(1)}
            disabled={concurrency >= MAX_CONCURRENT_DOWNLOADS_CAP}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--accent)] transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

const ToggleSlot: React.FC<{
  active: boolean;
  onClick?: () => void;
  /** Visual only: preference stored but inactive for current download mode. */
  muted?: boolean;
  disabled?: boolean;
}> = ({ active, onClick, muted = false, disabled = false }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300 border border-white/[0.05] disabled:pointer-events-none disabled:opacity-50 ${
      active
        ? "bg-[#2A1E1A] shadow-[0_2px_5px_rgba(0,0,0,0.5)]"
        : "bg-[#1D1613] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
    } ${muted && !disabled ? "opacity-45" : ""}`}
  >
    <motion.div
      animate={{ x: active ? 26 : 2 }}
      transition={{ type: "spring", stiffness: 600, damping: 35 }}
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-colors duration-300 ${
        active ? "bg-[color:var(--accent)]" : "bg-stone-700"
      }`}
    />
  </button>
);

const SettingItem: React.FC<SettingItemProps> = ({
  title,
  description,
  control,
  active = true,
  onClick,
}) => {
  const { query, forceShow } = useContext(SettingsSearchContext);
  if (!settingsTextMatches(query, title, description) && !forceShow) {
    return null;
  }

  return (
    <div onClick={onClick} className={`group rf-settings-row ${onClick ? "cursor-pointer" : ""}`}>
      <div className="rf-settings-row-label space-y-0.5">
        <h4 className={active ? "text-stone-100" : "text-stone-400"}>{title}</h4>
        <SettingsDescription description={description} className="max-w-md" />
      </div>
      {control ? (
        <div className="rf-settings-row-control" onClick={(e) => e.stopPropagation()}>
          {control}
        </div>
      ) : null}
    </div>
  );
};

/** Keeps non-row panels (trees, custom blocks) in search results via keywords. */
const SearchableBlock: React.FC<{
  keywords: string;
  children: React.ReactNode;
}> = ({ keywords, children }) => {
  const { query, forceShow } = useContext(SettingsSearchContext);
  if (!forceShow && !settingsTextMatches(query, keywords)) {
    return null;
  }
  return <div className="rf-settings-row rf-settings-row--block">{children}</div>;
};

export const SettingsView: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const activeTab = useRuforgeStore((s) => s.settingsTab);
  const setSettingsTab = useRuforgeStore((s) => s.setSettingsTab);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const internalVault = useRuforgeStore((s) => s.internalVault);
  const libraryScanDirs = useRuforgeStore((s) => s.libraryScanDirs);
  const addLibraryScanDir = useRuforgeStore((s) => s.addLibraryScanDir);
  const removeLibraryScanDir = useRuforgeStore((s) => s.removeLibraryScanDir);
  const [regroupPlaylistOpen, setRegroupPlaylistOpen] = useState(false);
  const [migrateLibraryOpen, setMigrateLibraryOpen] = useState(false);
  const [musicMetaBackfillOpen, setMusicMetaBackfillOpen] = useState(false);
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const handleSetSaveToInternal = useRuforgeStore((s) => s.handleSetSaveToInternal);
  const setOutputDir = useRuforgeStore((s) => s.setOutputDir);
  const notify = useRuforgeStore((s) => s.notify);
  const downloadJobs = useRuforgeStore((s) => s.downloadJobs);
  const entries = useRuforgeStore((s) => s.entries);
  const openExportPanel = useRuforgeStore((s) => s.openExportPanel);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const [devReplayMode, setDevReplayModeState] = useState<DevReplayMode>(() =>
    getDevReplayMode(),
  );
  const [lastBatchSummary, setLastBatchSummary] = useState(() =>
    formatLastBatchSummary(readLastDownloadBatchRecord()),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [headerCompact, setHeaderCompact] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const panelHeight = useMotionValue(0);
  const titleBlockHeight = useMotionValue(0);
  const titleBlockOpacity = useTransform(titleBlockHeight, [0, 32], [0, 1]);
  const heightPrimedRef = useRef(false);
  const titleHeightPrimedRef = useRef(false);
  const heightAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const titleHeightAnimRef = useRef<ReturnType<typeof animate> | null>(null);
  const headerCompactRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const headerMeasureRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLDivElement>(null);
  const bodyMeasureRef = useRef<HTMLDivElement>(null);
  const isSearching = searchQuery.trim().length > 0;
  const showSearchField = !headerCompact || searchExpanded || isSearching;
  const settingsMaxHeight = useMemo(() => {
    if (typeof window === "undefined") return 840;
    return Math.min(Math.round(window.innerHeight * 0.88), 840);
  }, [open]);
  const downloadQueueBusy = downloadJobs.some(
    (j) =>
      j.status === "queued" ||
      j.status === "downloading" ||
      j.status === "paused",
  );
  const hasLastBatch =
    (readLastDownloadBatchRecord()?.items.length ?? 0) > 0;
  const {
    status: ytdlpStatus,
    loading: ytdlpLoading,
    checking: ytdlpChecking,
    updating: ytdlpUpdating,
    percent: ytdlpPercent,
    invokeError: ytdlpError,
    checkAndUpdate: checkAndUpdateYtdlp,
  } = useYtdlpUpdate(activeTab === "downloads" || isSearching);

  const {
    status: denoStatus,
    loading: denoLoading,
    installing: denoInstalling,
    percent: denoPercent,
    invokeError: denoError,
    install: installDeno,
  } = useDenoStatus(activeTab === "downloads" || isSearching);

  const accentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      headerCompactRef.current = false;
      setHeaderCompact(false);
      setSearchExpanded(false);
      heightPrimedRef.current = false;
      titleHeightPrimedRef.current = false;
      heightAnimRef.current?.stop();
      heightAnimRef.current = null;
      titleHeightAnimRef.current?.stop();
      titleHeightAnimRef.current = null;
      return;
    }
    if (!showSearchField) return;
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open, showSearchField]);

  useLayoutEffect(() => {
    if (!open) return;
    const root = settingsScrollRef.current;
    if (root) root.scrollTop = 0;
    headerCompactRef.current = false;
    setHeaderCompact(false);
    setSearchExpanded(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const inner = titleInnerRef.current;
    if (!inner) return;

    const target = headerCompact ? 0 : Math.max(inner.scrollHeight, 1);
    if (!titleHeightPrimedRef.current) {
      titleHeightAnimRef.current?.stop();
      titleHeightAnimRef.current = null;
      titleBlockHeight.jump(target);
      titleHeightPrimedRef.current = true;
      return;
    }
    if (Math.abs(titleBlockHeight.get() - target) < 0.5) return;
    titleHeightAnimRef.current?.stop();
    titleHeightAnimRef.current = animate(titleBlockHeight, target, MORPH_SPRING);
  }, [open, headerCompact, titleBlockHeight, isSearching]);

  useLayoutEffect(() => {
    if (!open) return;
    const headerEl = headerMeasureRef.current;
    const bodyEl = bodyMeasureRef.current;
    if (!headerEl || !bodyEl) return;

    const apply = () => {
      const bodyH = Math.max(bodyEl.scrollHeight, bodyEl.offsetHeight);
      if (bodyH < 48) return;
      const maxH = Math.min(Math.round(window.innerHeight * 0.88), 840);
      const natural =
        headerEl.offsetHeight + bodyH + SETTINGS_SHELL_PAD_PX * 2;
      const nextH = Math.min(Math.max(natural, 320), maxH);

      if (!heightPrimedRef.current) {
        heightAnimRef.current?.stop();
        heightAnimRef.current = null;
        panelHeight.jump(nextH);
        heightPrimedRef.current = true;
        return;
      }

      if (Math.abs(panelHeight.get() - nextH) < 0.5) return;
      heightAnimRef.current?.stop();
      heightAnimRef.current = animate(panelHeight, nextH, MORPH_SPRING);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(headerEl);
    ro.observe(bodyEl);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [
    open,
    panelHeight,
    settingsMaxHeight,
    activeTab,
    headerCompact,
    searchExpanded,
    isSearching,
    settings.showDebuggingSettings,
  ]);

  const syncHeaderCompactFromScroll = (scrollTop: number) => {
    // Hysteresis: enter compact past 40px, leave only near the top.
    const next = headerCompactRef.current
      ? scrollTop > 12
      : scrollTop > 40;
    if (headerCompactRef.current === next) return;
    headerCompactRef.current = next;
    setHeaderCompact(next);
    if (!next) setSearchExpanded(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (searchQuery.trim()) {
          setSearchQuery("");
          return;
        }
        if (searchExpanded) {
          setSearchExpanded(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, searchQuery, searchExpanded]);

  useEffect(() => {
    if (activeTab !== "debugging") return;
    setLastBatchSummary(formatLastBatchSummary(readLastDownloadBatchRecord()));
  }, [activeTab, downloadJobs.length]);

  useEffect(() => {
    const unlisten = listen<{ busy?: boolean }>("ruforge-updater-check-status", (event) => {
      setUpdateCheckBusy(!!event.payload.busy);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const handleDevReplayModeChange = (mode: DevReplayMode) => {
    setDevReplayMode(mode);
    setDevReplayModeState(mode);
  };

  const handlePickDirectory = async () => {
    const selected = await openDirectoryDialog({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setOutputDir(selected);
    }
  };

  const handleAddLibraryScanFolder = async () => {
    const selected = await openDirectoryDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    const key = normalizeScanDirKey(selected);
    if (key === normalizeScanDirKey(internalVault)) {
      notify("Internal vault is always scanned.", "info");
      return;
    }
    if (libraryScanDirs.some((d) => normalizeScanDirKey(d) === key)) {
      notify("That folder is already in the library scan list.", "info");
      return;
    }
    addLibraryScanDir(selected);
    notify("Folder added to library scan.");
  };

  const handleOpenExportPanel = () => {
    const preset = buildEntireLibraryExportPreset(entries);
    if (!preset) {
      notify("Library is empty. Scan or download first.", "warning");
      return;
    }
    openExportPanel(preset);
  };

  const handleClearCache = async () => {
    try {
      const n = await invoke<number>("clear_ruforge_cache");
      notify(`Cleared ${n} cached file(s).`);
    } catch (e) {
      console.error(e);
      notify("Failed to clear cache.");
    }
  };

  const ytdlpBusy = ytdlpLoading || ytdlpChecking || ytdlpUpdating;

  const ytdlpVersionDescription = (() => {
    if (ytdlpLoading && !ytdlpStatus) {
      return "Checking bundled YouTube downloader version…";
    }
    if (ytdlpError && !ytdlpStatus) {
      return ytdlpError;
    }
    if (!ytdlpStatus) {
      return "Checks GitHub for the latest yt-dlp release and installs it when newer.";
    }
    const active = ytdlpStatus.activeVersion;
    const latest = ytdlpStatus.latestVersion?.trim();
    const source =
      ytdlpStatus.activeSource === "userdata" ? "user copy" : "bundled copy";
    if (ytdlpStatus.updateAvailable && latest) {
      return `Active ${active} (${source}). Release ${latest} is available on GitHub.`;
    }
    if (latest && latest !== active) {
      return `Active ${active} (${source}). Latest upstream release is ${latest}.`;
    }
    if (latest) {
      return `Active ${active} (${source}). Up to date with release ${latest}.`;
    }
    if (ytdlpStatus.checkError) {
      return `Active ${active} (${source}). Could not reach GitHub: ${ytdlpStatus.checkError}`;
    }
    return `Active ${active} (${source}). Checks GitHub for the latest yt-dlp release.`;
  })();

  const handleYtdlpCheckAndUpdate = async () => {
    const result = await checkAndUpdateYtdlp();
    if (!result.ok) {
      notify(result.error ?? "Could not check yt-dlp version.", "error");
      return;
    }
    if (result.updated) {
      notify(`yt-dlp updated to ${result.status?.activeVersion ?? "latest"}.`);
      return;
    }
    notify(`yt-dlp is up to date (${result.status?.activeVersion ?? "current"}).`);
  };

  const denoBusy = denoLoading || denoInstalling;

  const denoVersionDescription = (() => {
    if (denoLoading && !denoStatus) {
      return "Checking JavaScript runtime…";
    }
    if (denoError && !denoStatus) {
      return denoError;
    }
    if (!denoStatus?.present) {
      return "Not installed. Required to solve YouTube's download challenge. Install automatically below.";
    }
    return denoStatus.version
      ? `Installed: ${denoStatus.version}`
      : "Installed at " + (denoStatus.path ?? "unknown path");
  })();

  const handleDenoInstall = async () => {
    const result = await installDeno();
    if (!result.ok) {
      notify(result.error ?? "Could not install Deno.", "error");
      return;
    }
    notify("JavaScript runtime installed. Downloads will now solve the n-challenge automatically.");
  };

  if (!open) return null;

  const navGroups = SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => item.id !== "debugging" || settings.showDebuggingSettings,
    ),
  })).filter((group) => group.items.length > 0);

  const showTab = (tab: SettingsTab) => isSearching || activeTab === tab;

  const selectSettingsTab = (tab: SettingsTab) => {
    setSearchQuery("");
    setSearchExpanded(false);
    if (tab === activeTab && !isSearching) return;
    setSettingsTab(tab);
    const el = settingsScrollRef.current;
    if (el) el.scrollTop = 0;
    headerCompactRef.current = false;
    setHeaderCompact(false);
  };

  return (
    <div
      className={`fixed inset-0 ${OVERLAY_Z_CLASS.settings} flex items-center justify-center bg-black/65 p-4 sm:p-6`}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close settings"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rf-settings-dialog-title"
        initial={false}
        className="relative flex w-full max-w-[56rem] flex-col overflow-hidden rounded-[24px] bg-[#271C18] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
        style={{
          height: panelHeight,
          maxHeight: settingsMaxHeight,
          padding: SETTINGS_SHELL_PAD_PX,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SettingsSearchRootContext.Provider value={searchQuery}>
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[#1D1613]">
            <div
              ref={headerMeasureRef}
              className="relative shrink-0 px-5 pb-2.5 pt-2.5 sm:px-7"
            >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-5 top-2.5 z-30 rounded-lg p-1.5 text-stone-500 transition-colors hover:text-stone-200 sm:right-7"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <motion.div
              style={{ height: titleBlockHeight, opacity: titleBlockOpacity }}
              className="overflow-hidden"
              aria-hidden={headerCompact}
            >
              <div
                ref={titleInnerRef}
                className={cn(
                  "pt-2.5 pr-10",
                  headerCompact && "pointer-events-none",
                )}
              >
                <div className="mb-4 min-w-0">
                  <h2
                    id="rf-settings-dialog-title"
                    className="rf-settings-page-title text-[1.5rem]"
                  >
                    Settings
                  </h2>
                  <p className="mt-0.5 text-sm font-medium text-stone-500">
                    System configuration and preferences.
                  </p>
                </div>

                <label className="relative mb-4 block">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500"
                    aria-hidden
                  />
                  <input
                    ref={headerCompact ? undefined : searchInputRef}
                    type="text"
                    role="searchbox"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search settings"
                    autoComplete="off"
                    spellCheck={false}
                    tabIndex={headerCompact ? -1 : 0}
                    className="rf-settings-search-input w-full rounded-xl bg-[#261d18] py-2.5 pl-10 pr-10 text-[13px] text-stone-200 outline-none placeholder:text-stone-600 focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent),transparent_55%)]"
                  />
                  {isSearching ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-500 hover:text-stone-200"
                      aria-label="Clear search"
                      tabIndex={headerCompact ? -1 : 0}
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
              </div>
            </motion.div>

            <div>
              <div
                className={cn(
                  "flex items-center gap-2",
                  headerCompact ? "pr-10" : null,
                )}
              >
                {headerCompact ? (
                  <button
                    type="button"
                    onClick={() => setSearchExpanded((v) => !v)}
                    className={cn(
                      "shrink-0 rounded-lg p-1.5 transition-colors",
                      showSearchField || isSearching
                        ? "text-[color:var(--accent)]"
                        : "text-stone-500 hover:text-stone-200",
                    )}
                    aria-label="Search settings"
                    aria-pressed={showSearchField}
                  >
                    <Search size={16} />
                  </button>
                ) : null}

                <nav
                  className={cn(
                    "flex min-w-0 flex-1 justify-center gap-x-5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    headerCompact && "gap-x-1.5",
                    isSearching && "pointer-events-none opacity-40",
                  )}
                  aria-label="Settings sections"
                  aria-hidden={isSearching}
                >
                  {navGroups.map((group) => (
                    <div
                      key={group.label}
                      className={cn(
                        "flex shrink-0 flex-col items-center",
                        headerCompact ? "gap-0" : "gap-1.5",
                      )}
                    >
                      {!headerCompact ? (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">
                          {group.label}
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "flex items-center gap-1 bg-[#221a16] p-1",
                          headerCompact ? "rounded-xl" : "rounded-2xl",
                        )}
                      >
                        {group.items.map((item) => {
                          const isActive = !isSearching && activeTab === item.id;
                          const Icon = item.icon;
                          const tabButton = (
                            <button
                              type="button"
                              aria-label={item.label}
                              onClick={() => selectSettingsTab(item.id)}
                              className={cn(
                                "relative flex items-center transition-colors",
                                headerCompact
                                  ? "rounded-lg px-2 py-1.5"
                                  : "gap-2 rounded-xl px-3 py-2",
                                isActive
                                  ? "text-stone-100"
                                  : "text-stone-500 hover:text-stone-200",
                              )}
                            >
                              {isActive ? (
                                <motion.span
                                  layoutId={
                                    headerCompact
                                      ? "settingsTopNavActiveCompact"
                                      : "settingsTopNavActive"
                                  }
                                  className={cn(
                                    "absolute inset-0 bg-[#2c241f]",
                                    headerCompact ? "rounded-lg" : "rounded-xl",
                                  )}
                                  transition={MORPH_SPRING}
                                />
                              ) : null}
                              <Icon
                                size={headerCompact ? 14 : 15}
                                className={cn(
                                  "relative z-10 shrink-0",
                                  isActive
                                    ? "text-[color:var(--accent)]"
                                    : "text-current",
                                )}
                                aria-hidden
                              />
                              {!headerCompact ? (
                                <span className="relative z-10 text-[12px] font-medium">
                                  {item.label}
                                </span>
                              ) : null}
                            </button>
                          );

                          if (!headerCompact) {
                            return (
                              <Fragment key={item.id}>{tabButton}</Fragment>
                            );
                          }

                          return (
                            <IconPillTooltip
                              key={item.id}
                              label={item.label}
                              uppercase={false}
                              className="inline-flex"
                            >
                              {tabButton}
                            </IconPillTooltip>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </nav>

              </div>

              {headerCompact && showSearchField ? (
                <label className="relative mt-2 block">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500"
                    aria-hidden
                  />
                  <input
                    ref={headerCompact ? searchInputRef : undefined}
                    type="text"
                    role="searchbox"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onBlur={() => {
                      if (!searchQuery.trim()) setSearchExpanded(false);
                    }}
                    placeholder="Search settings"
                    autoComplete="off"
                    spellCheck={false}
                    className="rf-settings-search-input w-full rounded-xl bg-[#261d18] py-2 pl-9 pr-9 text-[13px] text-stone-200 outline-none placeholder:text-stone-600 focus:ring-1 focus:ring-[color-mix(in_srgb,var(--accent),transparent_55%)]"
                  />
                  {isSearching ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-500 hover:text-stone-200"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </label>
              ) : null}
            </div>
            </div>

          <div
            ref={settingsScrollRef}
            onScroll={(e) => {
              syncHeaderCompactFromScroll(e.currentTarget.scrollTop);
            }}
            className="rf-settings-shell min-h-0 flex-1 overflow-y-auto rf-scrollbar px-5 pb-6 pt-1 sm:px-7"
          >
            <div ref={bodyMeasureRef}>
            {!isSearching ? (
              <h3 className="mb-5 text-base font-semibold tracking-tight text-stone-100">
                {SETTINGS_TAB_LABELS[activeTab]}
              </h3>
            ) : (
              <p className="mb-5 text-sm text-stone-500">
                Results for &ldquo;{searchQuery.trim()}&rdquo;
              </p>
            )}
            <div className="space-y-0">
          {showTab("general") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.general}
                </h3>
              ) : null}
              <SettingsSection title="Storage">
                <SettingItem
                  title="Storage Limit"
                  description="Maximum space RuForge can use for internal media."
                  control={
                    <CustomSelect
                      value={`${settings.storageLimitGB}GB`}
                      options={['10GB', '25GB', '50GB', '100GB', '250GB']}
                      onChange={(val) => {
                        const num = parseInt(val.replace('GB', ''));
                        void updateSetting('storageLimitGB', num);
                      }}
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="System">
                <SettingItem
                  title="Launch at Startup"
                  description="Automatically start RuForge when you log in to your computer."
                  active={settings.launchAtStartup}
                  control={
                    <ToggleSlot
                      active={settings.launchAtStartup}
                      onClick={() => updateSetting('launchAtStartup', !settings.launchAtStartup)}
                    />
                  }
                />
                <SettingItem
                  title="System Tray"
                  description="Minimize the app to the system tray instead of closing it."
                  active={settings.minimizeToTray}
                  control={
                    <ToggleSlot
                      active={settings.minimizeToTray}
                      onClick={() => updateSetting('minimizeToTray', !settings.minimizeToTray)}
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="Discord">
                <SettingItem
                  title="Show activity on Discord"
                  description="When Discord is open, share RuForge activity with friends. What they see is controlled by the two options below."
                  active={settings.discordPresenceEnabled}
                  control={
                    <ToggleSlot
                      active={settings.discordPresenceEnabled}
                      onClick={() =>
                        void updateSetting(
                          "discordPresenceEnabled",
                          !settings.discordPresenceEnabled,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Include media titles"
                  description="When watching or listening, show the real track or video name. Off uses generic lines like Watching a video."
                  active={settings.discordPresenceEnabled}
                  control={
                    <ToggleSlot
                      active={settings.discordPresenceShowTitles}
                      disabled={!settings.discordPresenceEnabled}
                      onClick={() =>
                        void updateSetting(
                          "discordPresenceShowTitles",
                          !settings.discordPresenceShowTitles,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Include browsing status"
                  description="Off: friends only see you while watching, listening, or downloading. On: also show library, Explorer, downloader, and settings."
                  active={settings.discordPresenceEnabled}
                  control={
                    <ToggleSlot
                      active={settings.discordPresenceShowBrowsing}
                      disabled={!settings.discordPresenceEnabled}
                      onClick={() =>
                        void updateSetting(
                          "discordPresenceShowBrowsing",
                          !settings.discordPresenceShowBrowsing,
                        )
                      }
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="Developer">
                <SettingItem
                  title="Debugging settings"
                  description="Shows a Debugging tab with developer tools (group playlist files, cycle updater UI, and future debug actions)."
                  active={settings.showDebuggingSettings}
                  control={
                    <ToggleSlot
                      active={settings.showDebuggingSettings}
                      onClick={() => {
                        const next = !settings.showDebuggingSettings;
                        void updateSetting('showDebuggingSettings', next);
                        if (!next && useRuforgeStore.getState().settingsTab === 'debugging') {
                          setSettingsTab('general');
                        }
                      }}
                    />
                  }
                />
              </SettingsSection>
            </div>
          )}

          {showTab("downloads") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.downloads}
                </h3>
              ) : null}
              <SettingsSection title="Location">
                <SettingItem
                  title="Storage Target"
                  description={saveToInternal ? "Saving to RuForge Internal Vault." : "Saving to Custom Download Path."}
                  control={
                    <div className="flex p-1 bg-[#1D1613] rounded-xl border border-white/5 relative">
                      <button
                        onClick={() => handleSetSaveToInternal(true)}
                        className={`relative px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-colors duration-300 z-10 ${
                          saveToInternal ? 'text-[#1D1613]' : 'text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {saveToInternal && (
                          <motion.div
                            layoutId="activeStorage"
                            className="absolute inset-0 bg-[color:var(--accent)] rounded-lg z-0"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10">INTERNAL</span>
                      </button>
                      <button
                        onClick={() => handleSetSaveToInternal(false)}
                        className={`relative px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-colors duration-300 z-10 ${
                          !saveToInternal ? 'text-[#1D1613]' : 'text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {!saveToInternal && (
                          <motion.div
                            layoutId="activeStorage"
                            className="absolute inset-0 bg-[color:var(--accent)] rounded-lg z-0"
                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                          />
                        )}
                        <span className="relative z-10">CUSTOM</span>
                      </button>
                    </div>
                  }
                />
                <SettingItem
                  title="Download Path"
                  description={
                    saveToInternal
                      ? `Used when Storage Target is CUSTOM (not used while INTERNAL is on). Current: ${outputDir}`
                      : `New downloads save here. Current: ${outputDir}`
                  }
                  control={
                    <button
                      onClick={handlePickDirectory}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95"
                    >
                      CHANGE DIRECTORY
                    </button>
                  }
                />
                <SettingItem
                  title="Library scan locations"
                  description="Folders shown in Media. Internal vault is always included. Does not change where downloads save."
                />
                <SettingItem
                  title="Internal vault"
                  description={internalVault || "Internal media folder"}
                  control={
                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-600">
                      Always on
                    </span>
                  }
                />
                {libraryScanDirs.map((dir) => (
                  <SettingItem
                    key={dir}
                    title="Scan folder"
                    description={dir}
                    control={
                      <button
                        type="button"
                        onClick={() => removeLibraryScanDir(dir)}
                        className="rounded-lg p-2 text-stone-500 hover:text-red-400 transition-colors"
                        aria-label="Remove scan folder"
                      >
                        <X size={16} />
                      </button>
                    }
                  />
                ))}
                <SettingItem
                  title="Add library scan folder"
                  description="Use for export drives or archives without routing new downloads there."
                  control={
                    <button
                      type="button"
                      onClick={() => void handleAddLibraryScanFolder()}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95"
                    >
                      ADD FOLDER
                    </button>
                  }
                />
              </SettingsSection>
              <SettingsSection title="Audio">
                <SettingItem
                  title="Download audio only"
                  description="Extract audio with yt-dlp (no video file). Thumbnail and metadata are still saved for the library player."
                  active={settings.downloadAudioOnly}
                  control={
                    <ToggleSlot
                      active={settings.downloadAudioOnly}
                      onClick={() =>
                        updateSetting('downloadAudioOnly', !settings.downloadAudioOnly)
                      }
                    />
                  }
                />
                <SettingItem
                  title="Remember queue audio choice"
                  description="When you toggle Audio (A) on a queue row, also update the default for new downloads."
                  active={settings.rememberAudioOnlyDefault}
                  control={
                    <ToggleSlot
                      active={settings.rememberAudioOnlyDefault}
                      onClick={() =>
                        updateSetting(
                          "rememberAudioOnlyDefault",
                          !settings.rememberAudioOnlyDefault,
                        )
                      }
                    />
                  }
                />
                {settings.downloadAudioOnly && (
                  <SettingItem
                    title="Audio format"
                    description="Passed to yt-dlp --audio-format (requires ffmpeg for conversion)."
                    control={
                      <CustomSelect
                        value={(settings.downloadAudioFormat ?? 'm4a').toUpperCase()}
                        options={DOWNLOAD_AUDIO_FORMAT_OPTIONS.map((f) => f.toUpperCase())}
                        onChange={(val) =>
                          updateSetting('downloadAudioFormat', val.toLowerCase())
                        }
                      />
                    }
                  />
                )}
              </SettingsSection>
              <SettingsSection title="Video & Quality">
                <SettingItem
                  title="Preferred Quality"
                  description={
                    settings.downloadAudioOnly
                      ? "Used when audio-only is off. Video quality is ignored while audio-only is enabled."
                      : "Default video quality for new downloads."
                  }
                  active={!settings.downloadAudioOnly}
                  control={
                    <CustomSelect
                      value={settings.preferredQuality}
                      options={["4K (2160p)", "1080p (HD)", "720p", "Best Available"]}
                      onChange={(val) => updateSetting("preferredQuality", val)}
                    />
                  }
                />
                <SettingItem
                  title="Concurrent downloads"
                  description={`How many yt-dlp jobs may run together (max ${MAX_CONCURRENT_DOWNLOADS_CAP}). Lower is safer for host rate limits.`}
                  control={
                    <MaxConcurrentDownloadsControl
                      concurrency={settings.maxConcurrentDownloads}
                      onConcurrencyChange={(n) => updateSetting("maxConcurrentDownloads", n)}
                    />
                  }
                />
                <SettingItem
                  title="Batch start delay"
                  description={
                    (settings.downloadJobStartDelayMs ?? 0) === 0
                      ? "No delay between job starts in a batch. Enable to reduce rate-limiting risk for large music playlist grabs."
                      : `${settings.downloadJobStartDelayMs} ms between each job start when batch-enqueueing (e.g. music playlists).`
                  }
                  control={
                    <CustomSelect
                      value={batchStartDelayLabel(settings.downloadJobStartDelayMs ?? 0)}
                      options={BATCH_START_DELAY_OPTIONS.map((o) => o.label)}
                      onChange={(label) => {
                        const option = BATCH_START_DELAY_OPTIONS.find((o) => o.label === label);
                        if (option) void updateSetting("downloadJobStartDelayMs", option.ms);
                      }}
                    />
                  }
                />
                <SettingItem
                  title="Download Subtitles"
                  description={
                    settings.downloadAudioOnly
                      ? "Saved for video downloads. Not used while Download audio only is on."
                      : settings.downloadSubtitles
                      ? `yt-dlp fetches: ${downloadSubtitleLangLabel(settings.downloadSubtitleLangs ?? "en.*")}. Player shows only sidecar files on disk.`
                      : "Subtitle sidecars are not downloaded with new videos."
                  }
                  active={settings.downloadSubtitles}
                  onClick={() =>
                    void updateSetting("downloadSubtitles", !settings.downloadSubtitles)
                  }
                  control={
                    <ToggleSlot
                      active={settings.downloadSubtitles}
                      muted={settings.downloadAudioOnly}
                      onClick={() =>
                        void updateSetting("downloadSubtitles", !settings.downloadSubtitles)
                      }
                    />
                  }
                />
                {settings.downloadSubtitles && (
                  <SettingItem
                    title="Subtitle Languages"
                    description={
                      settings.downloadAudioOnly
                        ? "Applies when you download video (audio-only mode skips subs)."
                        : "Passed to yt-dlp --sub-langs for manual and auto captions."
                    }
                    active={!settings.downloadAudioOnly}
                    control={
                      <CustomSelect
                        value={downloadSubtitleLangLabel(
                          settings.downloadSubtitleLangs ?? "en.*",
                        )}
                        options={DOWNLOAD_SUBTITLE_LANG_PRESETS.map((p) => p.label)}
                        onChange={(label) => {
                          const preset = DOWNLOAD_SUBTITLE_LANG_PRESETS.find(
                            (p) => p.label === label,
                          );
                          if (preset)
                            void updateSetting("downloadSubtitleLangs", preset.ytdlp);
                        }}
                      />
                    }
                  />
                )}
                <SettingItem
                  title="Auto scrubber previews"
                  description={
                    settings.downloadAudioOnly
                      ? "Saved for video downloads. Not used while Download audio only is on."
                      : settings.autoDownloadScrubberPreviews
                      ? "Sprite sheets for the player scrubber are built after each video download and for library videos still missing previews."
                      : "Use Generate Previews in the library to build scrubber sprites manually."
                  }
                  active={settings.autoDownloadScrubberPreviews}
                  onClick={() =>
                    void updateSetting(
                      "autoDownloadScrubberPreviews",
                      !settings.autoDownloadScrubberPreviews,
                    )
                  }
                  control={
                    <ToggleSlot
                      active={settings.autoDownloadScrubberPreviews}
                      muted={settings.downloadAudioOnly}
                      onClick={() =>
                        void updateSetting(
                          "autoDownloadScrubberPreviews",
                          !settings.autoDownloadScrubberPreviews,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Download comments"
                  description={
                    settings.downloadAudioOnly
                      ? "Saved for video downloads. Not used while Download audio only is on."
                      : settings.downloadComments
                      ? "Single-video downloads archive YouTube comments to a sidecar on disk. The player reads from disk when present, or fetches once from YouTube if missing and a source URL is available."
                      : "Comment sidecars are not fetched with new single-video downloads."
                  }
                  active={settings.downloadComments}
                  onClick={() =>
                    void updateSetting("downloadComments", !settings.downloadComments)
                  }
                  control={
                    <ToggleSlot
                      active={settings.downloadComments}
                      muted={settings.downloadAudioOnly}
                      onClick={() =>
                        void updateSetting("downloadComments", !settings.downloadComments)
                      }
                    />
                  }
                />
                <SettingItem
                  title="Skip Duplicates"
                  description="Automatically skip downloads when the video is already in your library."
                  active={settings.skipDuplicatesAutomatically}
                  control={
                    <ToggleSlot
                      active={settings.skipDuplicatesAutomatically}
                      onClick={() =>
                        updateSetting(
                          "skipDuplicatesAutomatically",
                          !settings.skipDuplicatesAutomatically,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Auto-save Playing Songs"
                  description="When browsing YouTube Music, automatically queue an audio download the moment you play a song — no copy-paste needed. Toggle anytime from the Music bar."
                  active={settings.autoDownloadPlayingSongs}
                  control={
                    <ToggleSlot
                      active={settings.autoDownloadPlayingSongs}
                      onClick={() =>
                        updateSetting(
                          "autoDownloadPlayingSongs",
                          !settings.autoDownloadPlayingSongs,
                        )
                      }
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="Updates">
                <SettingItem
                  title="YouTube downloader (yt-dlp)"
                  description={ytdlpVersionDescription}
                  active={!ytdlpBusy}
                  control={
                    <motion.div layout className="flex flex-col items-end gap-2 min-w-[140px]">
                      {typeof ytdlpPercent === "number" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="w-full h-1 rounded-full bg-white/10 overflow-hidden"
                        >
                          <div
                            className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
                            style={{
                              width: `${Math.min(100, Math.max(0, ytdlpPercent))}%`,
                            }}
                          />
                        </motion.div>
                      )}
                      <button
                        type="button"
                        disabled={ytdlpBusy}
                        onClick={() => void handleYtdlpCheckAndUpdate()}
                        className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                      >
                        {ytdlpUpdating
                          ? "UPDATING…"
                          : ytdlpChecking
                            ? "CHECKING…"
                            : "CHECK & UPDATE"}
                      </button>
                    </motion.div>
                  }
                />
                <SettingItem
                  title="JavaScript runtime (Deno)"
                  description={denoVersionDescription}
                  active={!denoBusy}
                  control={
                    <motion.div layout className="flex flex-col items-end gap-2 min-w-[140px]">
                      {typeof denoPercent === "number" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="w-full h-1 rounded-full bg-white/10 overflow-hidden"
                        >
                          <div
                            className="h-full bg-[color:var(--accent)] transition-[width] duration-200"
                            style={{
                              width: `${Math.min(100, Math.max(0, denoPercent))}%`,
                            }}
                          />
                        </motion.div>
                      )}
                      <button
                        type="button"
                        disabled={denoBusy}
                        onClick={() => void handleDenoInstall()}
                        className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                      >
                        {denoInstalling
                          ? "INSTALLING…"
                          : denoStatus?.present
                            ? "REINSTALL"
                            : "INSTALL"}
                      </button>
                    </motion.div>
                  }
                />
              </SettingsSection>
              <SettingsSection title="Export">
                <SettingItem
                  title="Export media bundle"
                  description="Copy library media and sidecars to a folder or removable drive."
                  control={
                    <button
                      type="button"
                      onClick={handleOpenExportPanel}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95"
                    >
                      EXPORT
                    </button>
                  }
                />
              </SettingsSection>
            </div>
          )}

          {showTab("playback") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.playback}
                </h3>
              ) : null}
              <SettingsSection title="Playback">
                <SettingItem
                  title="Auto-advance local audio"
                  description="When an mp3/m4a/flac track ends, plays the next one in alphabetical path order, same folder listing for the fullscreen player's directory scan and the Mini Player strip."
                  active={settings.audioAutoAdvanceFolder !== false}
                  control={
                    <ToggleSlot
                      active={settings.audioAutoAdvanceFolder !== false}
                      onClick={() =>
                        updateSetting(
                          'audioAutoAdvanceFolder',
                          !(settings.audioAutoAdvanceFolder !== false),
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Prefetch next audio"
                  description="Preloads the queued track in Chromium/WebView to reduce dead air. True gapless decode is not achievable with standalone HTML audio tags."
                  active={settings.audioPrefetchNext !== false}
                  control={
                    <ToggleSlot
                      active={settings.audioPrefetchNext !== false}
                      onClick={() =>
                        updateSetting('audioPrefetchNext', !(settings.audioPrefetchNext !== false))
                      }
                    />
                  }
                />
                <SettingItem
                  title="ReplayGain / loudness normalization"
                  description="Skipped in WebView2: chaining MediaElement + Web Audio for stable LUFS normalization is brittle across formats/OS mixers: revisit with native output or ffmpeg filters."
                  active={false}
                  control={
                    <span className="text-[9px] font-black uppercase tracking-widest text-stone-600 px-3">
                      Not shipped
                    </span>
                  }
                />
              </SettingsSection>
              <SettingsSection
                title="SponsorBlock"
                keywords="sponsor skip segment youtube chapters"
              >
                <SearchableBlock keywords="sponsor skip segment youtube chapters">
                  <SponsorBlockSettingsTree />
                </SearchableBlock>
              </SettingsSection>
            </div>
          )}

          {showTab("appearance") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.appearance}
                </h3>
              ) : null}
              <SettingsSection title="Theme">
                <SettingItem
                  title="Accent Color"
                  description="Primary color for buttons and highlights."
                  control={
                    <div className="flex items-center gap-2">
                      <input
                        ref={accentInputRef}
                        type="color"
                        className="sr-only"
                        aria-label="Pick accent color"
                        value={
                          typeof settings.accentColor === "string" && settings.accentColor.startsWith("#")
                            ? settings.accentColor
                            : "#EDCF9B"
                        }
                        onChange={(e) => updateSetting("accentColor", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => accentInputRef.current?.click()}
                        className="p-1.5 bg-[#1D1613] rounded-2xl shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] border border-white/5"
                      >
                        <div
                          className="w-10 h-10 rounded-xl border-2 border-white/10 shadow-lg cursor-pointer active:scale-90 transition-transform"
                          style={{ backgroundColor: settings.accentColor }}
                        />
                      </button>
                    </div>
                  }
                />
                <SettingItem
                  title="Grid Density"
                  description="Control how many items appear in the gallery view."
                  control={
                    <div className="flex p-1.5 bg-[#1D1613] rounded-2xl shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] border border-white/5">
                      {['Cozy', 'Default', 'Compact'].map(t => (
                        <button
                          key={t}
                          onClick={() => updateSetting('gridDensity', t)}
                          className={`relative px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-colors duration-300 ${
                            settings.gridDensity === t ? 'text-[#1D1613]' : 'text-stone-600 hover:text-stone-400'
                          }`}
                        >
                          {settings.gridDensity === t && (
                            <motion.div
                              layoutId="activeDensity"
                              className="absolute inset-0 bg-[color:var(--accent)] rounded-xl z-0"
                              transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                          )}
                          <span className="relative z-10">{t.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  }
                />
              </SettingsSection>
            </div>
          )}

          {showTab("advanced") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.advanced}
                </h3>
              ) : null}
              <SettingsSection title="Performance">
                <SettingItem
                  title="Hardware Acceleration"
                  description="Lets WebView2 use GPU for page rendering and video playback. Turn off only for graphics glitches, this is not audio quality. Changing this restarts RuForge (Windows)."
                  active={settings.hardwareAcceleration}
                  control={
                    <ToggleSlot
                      active={settings.hardwareAcceleration}
                      onClick={() => updateSetting('hardwareAcceleration', !settings.hardwareAcceleration)}
                    />
                  }
                />
              </SettingsSection>
              <SettingsSection title="Updates">
                <SettingItem
                  title="Check for updates"
                  description={
                    appVersion
                      ? `Installed v${appVersion}. Checks GitHub for a newer RuForge build and downloads it when available.`
                      : "Checks GitHub for a newer RuForge build and downloads it when available."
                  }
                  active={!updateCheckBusy}
                  control={
                    <button
                      type="button"
                      disabled={updateCheckBusy}
                      onClick={() => void emit("ruforge-check-updater")}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-50 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      {updateCheckBusy ? "CHECKING…" : "CHECK NOW"}
                    </button>
                  }
                />
              </SettingsSection>
              <SettingsSection title="Maintenance">
                <SettingItem
                  title="Clear Cache"
                  description="Delete temporary files and thumbnail cache."
                  active={false}
                  control={
                    <button
                      onClick={handleClearCache}
                      className="px-5 py-2.5 text-red-400 bg-[#1D1613] hover:bg-red-500/10 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-red-400/20 active:scale-95"
                    >
                      PURGE SYSTEM CACHE
                    </button>
                  }
                />
              </SettingsSection>
            </div>
          )}

          {showTab("debugging") && (
            <div
              className={cn(
                "flex flex-col",
                isSearching && "rf-settings-search-group",
              )}
            >
              {isSearching ? (
                <h3 className="rf-settings-search-group-title">
                  {SETTINGS_TAB_LABELS.debugging}
                </h3>
              ) : null}
              {settings.showDebuggingSettings &&
              settingsTextMatches(
                searchQuery,
                "companion",
                "browser",
                "pair",
                "lan",
                "qr",
              ) ? (
                <div className="rf-settings-row rf-settings-row--block">
                  <CompanionSettingsSection
                    active={activeTab === "debugging" || isSearching}
                  />
                </div>
              ) : null}
              {import.meta.env.DEV && settings.showDebuggingSettings ? (
                <SettingsSection
                  title="Dev captures"
                  keywords="screenshot capture annotate"
                >
                  <SearchableBlock keywords="screenshot capture annotate">
                    <DevCapturesSection />
                  </SearchableBlock>
                </SettingsSection>
              ) : null}
              {settings.showDebuggingSettings ? (
                <SettingsSection title="Telemetry">
                  <SettingItem
                    title="Usage telemetry"
                    description="Counts launches and grabs the basics: OS, app version, language. What you download never touches it."
                    active={settings.telemetryUsageEnabled}
                    control={
                      <ToggleSlot
                        active={settings.telemetryUsageEnabled}
                        onClick={() =>
                          void updateSetting(
                            "telemetryUsageEnabled",
                            !settings.telemetryUsageEnabled,
                          )
                        }
                      />
                    }
                  />
                  <SettingItem
                    title="Crash reports"
                    description="When something breaks, it sends me the crash, scrubbed clean first so no links or filenames ride along."
                    active={settings.telemetryCrashEnabled}
                    control={
                      <ToggleSlot
                        active={settings.telemetryCrashEnabled}
                        onClick={() =>
                          void updateSetting(
                            "telemetryCrashEnabled",
                            !settings.telemetryCrashEnabled,
                          )
                        }
                      />
                    }
                  />
                </SettingsSection>
              ) : null}
              <RegroupPlaylistModal
                open={regroupPlaylistOpen}
                onClose={() => setRegroupPlaylistOpen(false)}
                customOutputDir={outputDir}
              />
              <MigrateLibraryModal
                open={migrateLibraryOpen}
                onClose={() => setMigrateLibraryOpen(false)}
                libraryRoot={internalVault}
              />
              <MusicMetaBackfillModal
                open={musicMetaBackfillOpen}
                onClose={() => setMusicMetaBackfillOpen(false)}
                roots={galleryScanRootsFromStore({ internalVault, libraryScanDirs })}
              />
              <SettingsSection
                title="Debug logging"
                keywords="log category verbose rust"
              >
                <SearchableBlock keywords="log category verbose rust debug">
                  <DebugLogCategoryTree />
                </SearchableBlock>
              </SettingsSection>
              <SettingsSection title="Debugging">
                <SettingItem
                  title="Hide songs from main library"
                  description="Keep audio downloads and music playlists in Music mode only. The main Video Library shows movies and videos."
                  control={
                    <ToggleSlot
                      active={settings.hideAudioFromMainLibrary !== false}
                      onClick={() =>
                        void updateSetting(
                          "hideAudioFromMainLibrary",
                          settings.hideAudioFromMainLibrary === false,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Stamp artist tags on download"
                  description="After audio downloads, copy MusicBrainz artist genres and MBID onto each track sidecar. Turn off to skip artist lookups during the session; run Enrich music metadata to backfill later."
                  active={settings.stampTrackSidecarArtistTags !== false}
                  control={
                    <ToggleSlot
                      active={settings.stampTrackSidecarArtistTags !== false}
                      onClick={() =>
                        void updateSetting(
                          "stampTrackSidecarArtistTags",
                          settings.stampTrackSidecarArtistTags === false,
                        )
                      }
                    />
                  }
                />
                <SettingItem
                  title="Enrich music metadata"
                  description="Scan library audio for missing sidecars and patch legacy sidecars without artist genres. Always includes artist tag stamping."
                  onClick={() => setMusicMetaBackfillOpen(true)}
                />
                <SettingItem
                  title="Migrate library layout"
                  description="Reorganize the flat media root into Videos/, Music/, and Playlists/ bucket folders with per-item subfolders. Preview first, then confirm to move."
                  onClick={() => setMigrateLibraryOpen(true)}
                />
                <SettingItem
                  title="Group playlist downloads"
                  description="Move flat playlist files into a numbered subfolder so Media shows one stack card."
                  onClick={() => setRegroupPlaylistOpen(true)}
                />
                <SettingItem
                  title="Replay onboarding"
                  description="Open the welcome and feature walkthrough overlay."
                  control={
                    <button
                      type="button"
                      onClick={() => requestReplayOnboardingPreview()}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      REPLAY
                    </button>
                  }
                />
                <SettingItem
                  title="Preview Discord onboarding"
                  description="Island walkthrough for Discord Rich Presence only (skips older steps)."
                  control={
                    <button
                      type="button"
                      onClick={() => requestDiscordOnboardingPreview()}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      PREVIEW
                    </button>
                  }
                />
                <SettingItem
                  title="Preview boot splash"
                  description="Show the startup screen with the current nav mode background. Click anywhere to dismiss."
                  control={
                    <button
                      type="button"
                      onClick={() => void emit("debug-preview-boot-splash")}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      PREVIEW
                    </button>
                  }
                />
                <SettingItem
                  title="Preview UI crash screen"
                  description="React error boundary fallback. Only the dynamic island stays above the overlay. Hover it for the in-pill capture icon; after capture the island widens with the filename. Tap that row to annotate. Reload or Escape dismisses."
                  control={
                    <button
                      type="button"
                      onClick={() => void emit("debug-preview-crash-ui")}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      PREVIEW
                    </button>
                  }
                />
                <SettingItem
                  title="Preview fatal crash screen"
                  description="Renderer or out-of-memory fallback. Only the dynamic island stays above the overlay. Hover it for the in-pill capture icon; after capture the island widens with the filename. Tap that row to annotate. Reload or Escape dismisses."
                  control={
                    <button
                      type="button"
                      onClick={() => void emit("debug-preview-crash-fatal")}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      PREVIEW
                    </button>
                  }
                />
                <SettingItem
                  title="Cycle updater UI"
                  description="Step through Available, Downloading, Installing, and Post-Install updater phases."
                  control={
                    <button
                      type="button"
                      onClick={() => void emit("debug-cycle-updater")}
                      className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                    >
                      CYCLE PHASES
                    </button>
                  }
                />
                {import.meta.env.DEV && (
                  <>
                    <SettingItem
                      title="Re-download replay mode"
                      description="Real download runs yt-dlp then deletes resolved output paths. Simulate replays queue/UI paths without bandwidth."
                      control={
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDevReplayModeChange("real")}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border active:scale-95 ${
                              devReplayMode === "real"
                                ? "bg-[color:var(--accent)] text-[#1D1613] border-[color:var(--accent)]"
                                : "bg-[#1D1613] text-stone-400 border-white/10 hover:bg-stone-800"
                            }`}
                          >
                            REAL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDevReplayModeChange("simulate")}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all border active:scale-95 ${
                              devReplayMode === "simulate"
                                ? "bg-[color:var(--accent)] text-[#1D1613] border-[color:var(--accent)]"
                                : "bg-[#1D1613] text-stone-400 border-white/10 hover:bg-stone-800"
                            }`}
                          >
                            SIMULATE
                          </button>
                        </div>
                      }
                    />
                    <SettingItem
                      title="Re-download last batch"
                      description={lastBatchSummary}
                      control={
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            disabled={!hasLastBatch || downloadQueueBusy}
                            onClick={() => void emit("debug-replay-download-batch")}
                            className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 disabled:opacity-40 disabled:pointer-events-none text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                          >
                            REPLAY BATCH
                          </button>
                          <button
                            type="button"
                            disabled={!hasLastBatch}
                            onClick={() => {
                              clearLastDownloadBatchRecord();
                              setLastBatchSummary(
                                formatLastBatchSummary(readLastDownloadBatchRecord()),
                              );
                              notify("Last batch record cleared.", "info");
                            }}
                            className="text-[10px] font-bold tracking-wide text-stone-500 hover:text-stone-300 transition-colors disabled:opacity-40"
                          >
                            Clear record
                          </button>
                        </div>
                      }
                    />
                  </>
                )}
              </SettingsSection>
            </div>
          )}
            </div>
            </div>
          </div>
          </div>
        </SettingsSearchRootContext.Provider>
      </motion.div>
    </div>
  );
};
