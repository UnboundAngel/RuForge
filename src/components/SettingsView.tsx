import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Monitor, Download, Palette, Shield, Trash2, FolderOpen, ChevronDown, Database, Music, Bug, Captions, Layers, Minus, Plus, RefreshCw, Film } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { DOWNLOAD_AUDIO_FORMAT_OPTIONS } from '../downloadFormat';
import { DOWNLOAD_SUBTITLE_LANG_PRESETS, downloadSubtitleLangLabel, CUSTOM_CONCURRENT_DOWNLOADS_MIN, DEFAULT_MAX_CONCURRENT_DOWNLOADS, MAX_CONCURRENT_DOWNLOADS_CAP } from '../store/types';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { emit } from "@tauri-apps/api/event";
import { useRuforgeStore } from '../store/ruforgeStore';

interface SettingItemProps {
  icon: React.ElementType;
  title: string;
  description: string;
  control?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}

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
            exit={{ opacity: 0, height: 0 }}
            className="absolute top-full left-0 right-0 z-50 bg-[#1D1613] border border-white/5 border-t-0 rounded-b-xl overflow-hidden shadow-[0_15px_30px_rgba(0,0,0,0.6)]"
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
              exit={{ opacity: 0, height: 0 }}
              className="absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-xl border border-t-0 border-white/5 bg-[#1D1613] shadow-[0_15px_30px_rgba(0,0,0,0.6)]"
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

const ToggleSlot: React.FC<{ active: boolean; onClick?: () => void }> = ({ active, onClick }) => (
  <div 
    onClick={onClick}
    className={`w-12 h-6 rounded-full relative cursor-pointer transition-all duration-300 border border-white/[0.05] ${
      active 
      ? 'bg-[#2A1E1A] shadow-[0_2px_5px_rgba(0,0,0,0.5)]' 
      : 'bg-[#1D1613] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]'
    }`}
  >
    <motion.div 
      animate={{ x: active ? 26 : 2 }}
      transition={{ type: "spring", stiffness: 600, damping: 35 }}
      className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-colors duration-300 ${
        active ? 'bg-[color:var(--accent)]' : 'bg-stone-700'
      }`}
    />
  </div>
);

const FadingDivider = () => (
  <div className="h-px w-full bg-gradient-to-r from-transparent via-[#EDD79C]/15 to-transparent my-1" />
);

const SettingItem: React.FC<SettingItemProps> = ({ icon: Icon, title, description, control, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`group flex items-center justify-between p-6 rounded-[24px] transition-all duration-300 bg-transparent hover:bg-white/[0.02] ${
      onClick ? 'cursor-pointer' : 'cursor-default'
    }`}
  >
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 flex items-center justify-center transition-all duration-300 ${
        active 
        ? 'text-[color:var(--accent)]' 
        : 'text-stone-500'
      }`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h4 className={`text-sm font-bold transition-colors duration-300 ${active ? 'text-stone-100' : 'text-stone-300'}`}>
          {title}
        </h4>
        <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed max-w-[280px]">
          {description}
        </p>
      </div>
    </div>
    
    <div onClick={(e) => e.stopPropagation()}>
      {control}
    </div>
  </div>
);

export const SettingsView: React.FC = () => {
  const activeTab = useRuforgeStore((s) => s.settingsTab);
  const outputDir = useRuforgeStore((s) => s.outputDir);
  const saveToInternal = useRuforgeStore((s) => s.saveToInternal);
  const settings = useRuforgeStore((s) => s.settings);
  const updateSetting = useRuforgeStore((s) => s.updateSetting);
  const handleSetSaveToInternal = useRuforgeStore((s) => s.handleSetSaveToInternal);
  const setOutputDir = useRuforgeStore((s) => s.setOutputDir);
  const notify = useRuforgeStore((s) => s.notify);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);

  const accentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    const unlisten = listen<{ busy?: boolean }>("ruforge-updater-check-status", (event) => {
      setUpdateCheckBusy(!!event.payload.busy);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const handlePickDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setOutputDir(selected);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-10 max-w-3xl h-full pb-32 pt-20"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-stone-50">Settings</h1>
        <p className="text-stone-500 mt-1 text-sm font-medium">System configuration and preferences.</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {activeTab === 'general' && (
            <div className="flex flex-col">
              <SettingItem 
                icon={Database}
                title="Storage Limit"
                description="Maximum space RuForge can use for internal media."
                active={true}
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
              <FadingDivider />
              <SettingItem 
                icon={Monitor}
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
              <FadingDivider />
              <SettingItem 
                icon={Monitor}
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
            </div>
          )}

          {activeTab === 'downloads' && (
            <div className="flex flex-col">
              <SettingItem 
                icon={Database}
                title="Storage Target"
                description={saveToInternal ? "Saving to RuForge Internal Vault." : "Saving to Custom Download Path."}
                active={true}
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
              <FadingDivider />
              <SettingItem
                icon={Music}
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
              <FadingDivider />
              <SettingItem
                icon={Music}
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
                <>
                  <FadingDivider />
                  <SettingItem
                    icon={Music}
                    title="Audio format"
                    description="Passed to yt-dlp --audio-format (requires ffmpeg for conversion)."
                    active={true}
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
                </>
              )}
              <FadingDivider />
              <SettingItem 
                icon={Download}
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
                    options={['4K (2160p)', '1080p (HD)', '720p', 'Best Available']}
                    onChange={(val) => updateSetting('preferredQuality', val)}
                  />
                }
              />
              <FadingDivider />
              <SettingItem
                icon={Layers}
                title="Concurrent downloads"
                description={`How many yt-dlp jobs may run together (max ${MAX_CONCURRENT_DOWNLOADS_CAP}). Lower is safer for host rate limits.`}
                active={true}
                control={
                  <MaxConcurrentDownloadsControl
                    concurrency={settings.maxConcurrentDownloads}
                    onConcurrencyChange={(n) => updateSetting('maxConcurrentDownloads', n)}
                  />
                }
              />
              <FadingDivider />
              <SettingItem
                icon={Captions}
                title="Download Subtitles"
                description={
                  settings.downloadAudioOnly
                    ? "Not used for audio-only downloads."
                    : settings.downloadSubtitles
                    ? `yt-dlp fetches: ${downloadSubtitleLangLabel(settings.downloadSubtitleLangs ?? "en.*")}. Player shows only sidecar files on disk.`
                    : "Subtitle sidecars are not downloaded with new videos."
                }
                active={settings.downloadSubtitles && !settings.downloadAudioOnly}
                control={
                  <ToggleSlot
                    active={settings.downloadSubtitles && !settings.downloadAudioOnly}
                    onClick={() => {
                      if (settings.downloadAudioOnly) return;
                      updateSetting("downloadSubtitles", !settings.downloadSubtitles);
                    }}
                  />
                }
              />
              {settings.downloadSubtitles && !settings.downloadAudioOnly && (
                <>
                  <FadingDivider />
                  <SettingItem
                    icon={Captions}
                    title="Subtitle Languages"
                    description="Passed to yt-dlp --sub-langs for manual and auto captions."
                    active={true}
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
                </>
              )}
              <FadingDivider />
              <SettingItem
                icon={Film}
                title="Auto scrubber previews"
                description={
                  settings.downloadAudioOnly
                    ? "Not used for audio-only downloads."
                    : settings.autoDownloadScrubberPreviews
                    ? "Sprite sheets for the player scrubber are built after each video download."
                    : "Use Generate Previews in the library to build scrubber sprites manually."
                }
                active={settings.autoDownloadScrubberPreviews && !settings.downloadAudioOnly}
                control={
                  <ToggleSlot
                    active={
                      settings.autoDownloadScrubberPreviews && !settings.downloadAudioOnly
                    }
                    onClick={() => {
                      if (settings.downloadAudioOnly) return;
                      void updateSetting(
                        "autoDownloadScrubberPreviews",
                        !settings.autoDownloadScrubberPreviews,
                      );
                    }}
                  />
                }
              />
              <FadingDivider />
              <SettingItem
                icon={Download}
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
              <FadingDivider />
              <SettingItem 
                icon={FolderOpen}
                title="Download Path"
                description={outputDir}
                active={true}
                control={
                  <button 
                    onClick={handlePickDirectory}
                    className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-stone-300 rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-white/5 active:scale-95"
                  >
                    CHANGE DIRECTORY
                  </button>
                }
              />
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="flex flex-col">
              <SettingItem 
                icon={Palette}
                title="Accent Color"
                description="Primary color for buttons and highlights."
                active={true}
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
              <FadingDivider />
              <SettingItem 
                icon={Palette}
                title="Grid Density"
                description="Control how many items appear in the gallery view."
                active={true}
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
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="flex flex-col">
              <SettingItem 
                icon={Music}
                title="Auto-advance local audio"
                description="When an mp3/m4a/flac track ends, plays the next one in alphabetical path order, same folder listing for the fullscreen player’s directory scan and the Mini Player strip."
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
              <FadingDivider />
              <SettingItem 
                icon={Music}
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
              <FadingDivider />
              <SettingItem 
                icon={Shield}
                title="ReplayGain / loudness normalization"
                description="Skipped in WebView2: chaining MediaElement + Web Audio for stable LUFS normalization is brittle across formats/OS mixers: revisit with native output or ffmpeg filters."
                active={false}
                control={
                  <span className="text-[9px] font-black uppercase tracking-widest text-stone-600 px-3">
                    Not shipped
                  </span>
                }
              />
              <FadingDivider />
              <SettingItem 
                icon={Shield}
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
              <FadingDivider />
              <SettingItem
                icon={RefreshCw}
                title="Check for updates"
                description={
                  appVersion
                    ? `Installed v${appVersion}. Checks GitHub for a newer RuForge build.`
                    : "Checks GitHub for a newer RuForge build."
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
              <FadingDivider />
              <SettingItem 
                icon={Bug}
                title="Cycle Updater UI"
                description="Developer Tool: Step through Available, Downloading, Installing, and Post-Install phases to verify UI polish."
                active={true}
                control={
                  <button 
                    onClick={() => void emit("debug-cycle-updater")}
                    className="px-5 py-2.5 bg-[#1D1613] hover:bg-stone-800 text-[color:var(--accent)] rounded-xl text-[10px] font-black tracking-widest transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] border border-[color-mix(in_srgb,var(--accent),transparent_80%)] active:scale-95"
                  >
                    CYCLE PHASES
                  </button>
                }
              />
              <FadingDivider />
              <SettingItem 
                icon={Trash2}
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
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
