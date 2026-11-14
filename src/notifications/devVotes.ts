import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { useNotificationCenterStore } from "./notificationCenterStore";

const STORAGE_KEY = "ruforge-dev-votes-v1";
/** A poll's tallies are re-read when the bell opens, but not more often than this. */
const REFRESH_MIN_MS = 3 * 60_000;

type Tally = { counts: Record<string, number>; total: number; voted: string | null };

export type PollVote = {
  pick: string | null;
  counts: Record<string, number> | null;
  /** Last successful tally, ms. */
  at: number;
  busy: boolean;
  error: string | null;
};

type VoteState = { votes: Record<string, PollVote> };

type Stored = Record<string, { pick: string | null; counts: Record<string, number> | null; at: number }>;

function load(): Record<string, PollVote> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Stored;
    return Object.fromEntries(
      Object.entries(parsed).map(([id, v]) => [id, { pick: v.pick ?? null, counts: v.counts ?? null, at: v.at ?? 0, busy: false, error: null }]),
    );
  } catch {
    return {};
  }
}

export const useDevVotesStore = create<VoteState>(() => ({ votes: load() }));

function save(votes: Record<string, PollVote>): void {
  const out: Stored = {};
  for (const [id, v] of Object.entries(votes)) out[id] = { pick: v.pick, counts: v.counts, at: v.at };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    /* quota: the pick is re-read from the server on the next tally */
  }
}

function patch(id: string, next: Partial<PollVote>): void {
  useDevVotesStore.setState((s) => {
    const prev = s.votes[id] ?? { pick: null, counts: null, at: 0, busy: false, error: null };
    const votes = { ...s.votes, [id]: { ...prev, ...next } };
    save(votes);
    return { votes };
  });
}

/** Resolves false when the vote did not land, so the card stays unread with its error line. */
export async function castVote(pollId: string, optionId: string): Promise<boolean> {
  const cur = useDevVotesStore.getState().votes[pollId];
  if (cur?.busy || cur?.pick) return false;
  patch(pollId, { busy: true, error: null });
  try {
    const t = await invoke<Tally>("announcements_poll_vote", { pollId, optionId });
    patch(pollId, { busy: false, pick: t.voted ?? optionId, counts: t.counts, at: Date.now() });
    return true;
  } catch (e) {
    console.warn("[devVotes] vote failed", e);
    patch(pollId, { busy: false, error: "Couldn't send your vote. Try again." });
    return false;
  }
}

async function refresh(pollId: string): Promise<void> {
  patch(pollId, { busy: true });
  try {
    const t = await invoke<Tally>("announcements_poll_tally", { pollId });
    const pick = useDevVotesStore.getState().votes[pollId]?.pick ?? t.voted;
    patch(pollId, { busy: false, error: null, pick, counts: t.counts, at: Date.now() });
  } catch (e) {
    console.warn("[devVotes] tally failed", e);
    const had = useDevVotesStore.getState().votes[pollId]?.counts;
    patch(pollId, { busy: false, error: had ? null : "Couldn't load results." });
  }
}

/** Tallies are only read for polls whose results are visible: voted, or closed. */
function refreshVisible(): void {
  const now = Date.now();
  const { votes } = useDevVotesStore.getState();
  for (const i of useNotificationCenterStore.getState().local) {
    if (i.kind !== "dev-poll") continue;
    const id = i.id.slice("dev:".length);
    const v = votes[id];
    const closed = i.ref.endsAt != null && i.ref.endsAt <= now;
    if (!v?.pick && !closed) continue;
    if (v?.busy || (v && now - v.at < REFRESH_MIN_MS)) continue;
    void refresh(id);
  }
}

/** Main window only: refresh when the bell opens. */
export function startDevVotes(): () => void {
  return useNotificationCenterStore.subscribe((s, prev) => {
    if (s.popoverOpen && !prev.popoverOpen) refreshVisible();
  });
}
