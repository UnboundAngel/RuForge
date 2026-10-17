import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMilestoneNote, statsTakeMilestoneNotes } from "./activityStats";
import { recordNotification } from "@/notifications/recordNotification";
import { backfillRecordValues } from "./statsRecordBackfill";

const EVENT = "stats-milestones";

function isMainWindow(): boolean {
  try {
    return getCurrentWindow().label === "main";
  } catch {
    return false;
  }
}

async function drainNotes(): Promise<void> {
  try {
    const notes = await statsTakeMilestoneNotes();
    for (const note of notes) {
      if (!isMilestoneNote(note)) continue;
      recordNotification({
        id: `stats:${note.id}`,
        source: "stats",
        kind: "stats-milestone",
        title: note.title,
        subtitle: note.subtitle,
        thumbnail: null,
        channelId: null,
        createdAt: note.createdAt,
        read: false,
        actions: [],
        ref: {},
        record: note.value != null ? { value: note.value, previous: note.previous, titles: note.titles } : undefined,
      });
    }
  } catch (e) {
    console.warn("[statsMilestones] drain failed", e);
  }
}

/** Main window only: empty ping from Rust, then pull notes through the command. */
export async function startStatsMilestoneHost(): Promise<() => void> {
  if (!isMainWindow()) return () => undefined;
  void drainNotes().then(backfillRecordValues);
  const unlisten = await listen(EVENT, () => {
    void drainNotes();
  });
  return () => {
    unlisten();
  };
}
