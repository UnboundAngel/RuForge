import {
  Bluetooth,
  Cable,
  Check,
  Headphones,
  Monitor,
  Speaker,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  classifyAudioOutputDeviceKind,
  type AudioOutputDeviceKind,
} from "@/audioOutputDeviceKind";
import {
  listAudioOutputDevices,
  subscribeAudioOutputDeviceChange,
  type AudioOutputDevice,
} from "@/audioOutputDevices";
import {
  MUSIC_MENU_ICON_SIZE,
  MUSIC_MENU_TONES,
  MUSIC_MENU_WIDTH,
  MusicMenuPanel,
  MusicMenuRow,
  MusicMenuSection,
  useMusicMenuEscape,
  useMusicMenuOutsideDismiss,
} from "@/components/music/musicMenuUi";
import { cn } from "@/lib/utils";
import { islandBtnClass } from "./islandButtonClass";

type Props = {
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  /** Preferred list from main (required for desktop overlay webview). */
  devices?: AudioOutputDevice[];
};

const KIND_ICON: Record<AudioOutputDeviceKind, LucideIcon> = {
  default: Volume2,
  headphones: Headphones,
  display: Monitor,
  bluetooth: Bluetooth,
  virtual: Cable,
  speakers: Speaker,
};

function OutputIcon({ label }: { label: string }) {
  const Icon = KIND_ICON[classifyAudioOutputDeviceKind(label)];
  return <Icon size={MUSIC_MENU_ICON_SIZE} strokeWidth={2.25} aria-hidden />;
}

const MENU_GAP_PX = 6;

/**
 * Rendered in place rather than portaled: the island window only takes clicks on the island itself,
 * so a page-wide floating menu could land where it cannot be clicked. Opens upward because the
 * compact island ends just below the transport row.
 */
export function IslandAudioOutputControl({ selectedDeviceId, onSelect, devices: devicesProp }: Props) {
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(220);
  const [localDevices, setLocalDevices] = useState<AudioOutputDevice[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const devices =
    devicesProp && devicesProp.length > 0 ? devicesProp : localDevices;

  const refreshDevices = useCallback(() => {
    void listAudioOutputDevices({ unlock: true }).then(setLocalDevices);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (devicesProp && devicesProp.length > 0) return;
    refreshDevices();
    return subscribeAudioOutputDeviceChange(refreshDevices);
  }, [open, devicesProp, refreshDevices]);

  useMusicMenuEscape(open, close);
  useMusicMenuOutsideDismiss(open, rootRef, close, { preventDefault: false });

  const options = [
    { id: "", label: "System default" },
    ...devices.map((d) => ({ id: d.deviceId, label: d.label })),
  ];
  const accented = selectedDeviceId !== "" || open;

  return (
    <div ref={rootRef} className="pointer-events-auto relative">
      <button
        type="button"
        aria-label="Audio output"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(islandBtnClass, accented && "text-[color:var(--accent)] hover:text-[color:var(--accent)]")}
        onClick={(e) => {
          if (!open) setMaxHeight(Math.max(96, e.currentTarget.getBoundingClientRect().top - MENU_GAP_PX * 2));
          setOpen((v) => !v);
        }}
      >
        <Headphones className="pointer-events-none h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      {open ? (
        <MusicMenuPanel
          theme="library"
          role="menu"
          aria-label="Audio output"
          className="absolute bottom-full right-0 z-50 mb-1.5"
          style={{ width: MUSIC_MENU_WIDTH, maxHeight }}
        >
          <MusicMenuSection label="Output" tone={MUSIC_MENU_TONES.player}>
            {options.map((o) => {
              const selected = selectedDeviceId === o.id;
              return (
                <MusicMenuRow
                  key={o.id || o.label}
                  tone={MUSIC_MENU_TONES.player}
                  label={o.label}
                  active={selected}
                  icon={<OutputIcon label={o.label} />}
                  trailing={selected ? <Check size={12} strokeWidth={2.5} className="shrink-0 text-[color:var(--accent)]" aria-hidden /> : null}
                  onClick={() => {
                    onSelect(o.id);
                    close();
                  }}
                />
              );
            })}
          </MusicMenuSection>
        </MusicMenuPanel>
      ) : null}
    </div>
  );
}
