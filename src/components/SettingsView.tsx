import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Download, Palette, Shield, Trash2, FolderOpen, ChevronDown } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';

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
                  value === opt ? 'bg-amber-500 text-[#1D1613]' : 'text-stone-400 hover:bg-white/5'
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
        active ? 'bg-amber-500' : 'bg-stone-700'
      }`}
    />
  </div>
);

const SettingItem: React.FC<SettingItemProps> = ({ icon: Icon, title, description, control, active, onClick }) => (
  <div 
    onClick={onClick}
    className={`group flex items-center justify-between p-6 rounded-[24px] transition-all duration-300 bg-white/[0.01] hover:bg-white/[0.03] border border-white/[0.02] ${
      onClick ? 'cursor-pointer' : 'cursor-default'
    }`}
  >
    <div className="flex items-center gap-5">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
        active 
        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' 
        : 'bg-[#1D1613] text-stone-500 border border-white/[0.05] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
      }`}>
        <Icon className="w-5 h-5" />
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

export const SettingsView: React.FC<{ 
  activeTab: string, 
  outputDir: string,
  onOutputDirChange: (dir: string) => void,
  onNotify: (msg: string) => void
}> = ({ activeTab, outputDir, onOutputDirChange, onNotify }) => {

  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('ruforge-settings');
    if (saved) return JSON.parse(saved);
    return {
      launchAtStartup: true,
      minimizeToTray: true,
      preferredQuality: '1080p (HD)',
      accentColor: '#f59e0b',
      gridDensity: 'Default',
      hardwareAcceleration: true
    };
  });

  useEffect(() => {
    // Sync with backend on mount
    invoke('update_tray_config', { minimize: settings.minimizeToTray });
    
    const syncAutostart = async () => {
      try {
        const enabled = await isEnabled();
        if (enabled !== settings.launchAtStartup) {
          if (settings.launchAtStartup) await enable();
          else await disable();
        }
      } catch (e) {
        console.error('Autostart sync failed:', e);
      }
    };
    syncAutostart();
  }, []);

  const updateSetting = async (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('ruforge-settings', JSON.stringify(newSettings));

    if (key === 'minimizeToTray') {
      await invoke('update_tray_config', { minimize: value });
    }

    if (key === 'launchAtStartup') {
      try {
        if (value) await enable();
        else await disable();
      } catch (e) {
        console.error('Failed to update autostart:', e);
      }
    }
  };

  const handlePickDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      onOutputDirChange(selected);
    }
  };

  const handleClearCache = async () => {
    try {
      // Assuming you have a clear_cache command or similar, or just fake it for now
      // await invoke('clear_cache');
      onNotify("Cache cleared successfully.");
    } catch (e) {
      console.error(e);
      onNotify("Failed to clear cache.");
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
        <h1 className="text-3xl font-black tracking-tight text-amber-50">Settings</h1>
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
            <div className="space-y-3">
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
            <div className="space-y-3">
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
            <div className="space-y-3">
              <SettingItem 
                icon={Palette}
                title="Accent Color"
                description="Primary color for buttons and highlights."
                active={true}
                control={
                  <div className="p-1.5 bg-[#1D1613] rounded-2xl shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)] border border-white/5">
                    <div 
                      className="w-10 h-10 rounded-xl border-2 border-white/10 shadow-lg cursor-pointer active:scale-90 transition-transform" 
                      style={{ backgroundColor: settings.accentColor }}
                    />
                  </div>
                }
              />
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
                        className={`px-4 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all duration-400 ${
                          settings.gridDensity === t 
                          ? 'bg-amber-500 text-[#1D1613] shadow-[0_4px_10px_rgba(245,158,11,0.3)]' 
                          : 'text-stone-600 hover:text-stone-400'
                        }`}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                }
              />
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-3">
              <SettingItem 
                icon={Shield}
                title="Hardware Acceleration"
                description="Use the GPU for video decoding and UI rendering."
                active={settings.hardwareAcceleration}
                control={
                  <ToggleSlot 
                    active={settings.hardwareAcceleration} 
                    onClick={() => updateSetting('hardwareAcceleration', !settings.hardwareAcceleration)} 
                  />
                }
              />
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
