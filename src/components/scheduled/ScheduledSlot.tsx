import { useEffect, useState, type ComponentType } from "react";
import {
  loadScheduledFeature,
  scheduledFeatureIds,
  type ScheduledSlotName,
  type ScheduledSlots,
} from "@/lib/scheduled/registry";
import { useScheduledUnlocked } from "@/lib/scheduled/status";

type Mounted<K extends ScheduledSlotName> = { id: string; Component: ComponentType<ScheduledSlots[K]> };

/** Renders every unlocked scheduled feature that fills this slot. Renders nothing on public. */
export function ScheduledSlot<K extends ScheduledSlotName>({ name, ...props }: { name: K } & ScheduledSlots[K]) {
  const unlocked = useScheduledUnlocked();
  const [mounted, setMounted] = useState<Mounted<K>[]>([]);

  useEffect(() => {
    let alive = true;
    const ids = scheduledFeatureIds().filter((id) => unlocked.has(id));
    void Promise.all(
      ids.map(async (id) => {
        const mod = await loadScheduledFeature(id);
        const Component = mod?.slots?.[name] as ComponentType<ScheduledSlots[K]> | undefined;
        return Component ? { id, Component } : null;
      }),
    ).then((rows) => {
      if (alive) setMounted(rows.filter((r): r is Mounted<K> => r !== null));
    });
    return () => {
      alive = false;
    };
  }, [unlocked, name]);

  const slotProps = props as unknown as ScheduledSlots[K];
  return (
    <>
      {mounted.map(({ id, Component }) => (
        <Component key={id} {...slotProps} />
      ))}
    </>
  );
}
