import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from "motion/react";
import { Monitor, Download, Palette, Shield, Trash2, FolderOpen, ChevronDown, Database, Music, Bug, Captions } from 'lucide-react';
import { DOWNLOAD_SUBTITLE_LANG_PRESETS, downloadSubtitleLangLabel } from '../store/types';
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

  const accentInputRef = useRef<HTMLInputElement>(null);

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
                icon={Download}
                title="Preferred Quality"
                description="Default video quality for new downloads."
                active={true}
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
                icon={Captions}
                title="Download Subtitles"
                description={
                  settings.downloadSubtitles
                    ? `yt-dlp fetches: ${downloadSubtitleLangLabel(settings.downloadSubtitleLangs ?? "en.*")}. Player shows only sidecar files on disk.`
                    : "Subtitle sidecars are not downloaded with new videos."
                }
                active={settings.downloadSubtitles}
                control={
                  <ToggleSlot
                    active={settings.downloadSubtitles}
                    onClick={() =>
                      updateSetting("downloadSubtitles", !settings.downloadSubtitles)
                    }
                  />
                }
              />
              {settings.downloadSubtitles && (
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
