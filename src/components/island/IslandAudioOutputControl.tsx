import {
  Bluetooth,
  Cable,
  Headphones,
  Monitor,
  Speaker,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  classifyAudioOutputDeviceKind,
  type AudioOutputDeviceKind,
} from "@/audioOutputDeviceKind";
import {
  listAudioOutputDevices,
  subscribeAudioOutputDeviceChange,
  type AudioOutputDevice,
} from "@/audioOutputDevices";
import { MorphMenu, type MorphMenuItem } from "@/components/ui/Morph";

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

function outputDeviceIcon(label: string): ReactNode {
  const Icon = KIND_ICON[classifyAudioOutputDeviceKind(label)];
  return <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2.25} aria-hidden />;
}

export function IslandAudioOutputControl({ selectedDeviceId, onSelect, devices: devicesProp }: Props) {
  const [open, setOpen] = useState(false);
  const [localDevices, setLocalDevices] = useState<AudioOutputDevice[]>([]);

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

  const items = useMemo((): MorphMenuItem[] => {
    const rows: MorphMenuItem[] = [
      {
        id: "default",
        label: "System default",
        icon: outputDeviceIcon("System default"),
        active: selectedDeviceId === "",
        onSelect: () => onSelect(""),
      },
    ];
    for (const d of devices) {
      rows.push({
        id: d.deviceId || d.label,
        label: d.label,
        icon: outputDeviceIcon(d.label),
        active: selectedDeviceId === d.deviceId,
        onSelect: () => onSelect(d.deviceId),
      });
    }
    return rows;
  }, [devices, onSelect, selectedDeviceId]);

  const accented = selectedDeviceId !== "" || open;

  return (
    <MorphMenu
      open={open}
      onOpenChange={setOpen}
      triggerSize={28}
      align="end"
      paintedRest={false}
      marqueeOnHover
      aria-label="Audio output"
      className="pointer-events-auto"
      itemClassName="text-zinc-300 hover:bg-white/5 hover:text-white"
      activeItemClassName="bg-white/10 text-white"
      trigger={
        <Headphones
          className={
            accented ? "h-3.5 w-3.5 text-[color:var(--accent)]" : "h-3.5 w-3.5 text-zinc-300"
          }
          strokeWidth={2.25}
        />
      }
      items={items}
    />
  );
}
