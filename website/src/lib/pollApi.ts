export interface PollOptionResult {
  id: string;
  label: string;
  count: number;
}

export interface PollData {
  id: string;
  title: string;
  body: string;
  ends: string | null;
  closed: boolean;
  options: PollOptionResult[];
  total: number;
  voted: string | null;
}

export type PollLoad =
  | { kind: "ready"; poll: PollData }
  | { kind: "missing" }
  | { kind: "down" };

const VOTER_KEY = "ruforge-poll-voter";

export function voterId(): string {
  try {
    const saved = localStorage.getItem(VOTER_KEY);
    if (saved && /^[0-9a-f]{32}$/.test(saved)) return saved;
    const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(VOTER_KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked: a per-page id still lets this visit vote once.
    return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export async function fetchPoll(id: string): Promise<PollLoad> {
  try {
    const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}&voter=${voterId()}`);
    if (res.status === 404 || res.status === 400) return { kind: "missing" };
    if (!res.ok) return { kind: "down" };
    return { kind: "ready", poll: (await res.json()) as PollData };
  } catch {
    return { kind: "down" };
  }
}

/** Returns the fresh results, or null when the vote was not recorded. */
export async function sendVote(id: string, option: string): Promise<PollData | null> {
  try {
    const res = await fetch("/api/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, option, voter: voterId() }),
    });
    return res.ok ? ((await res.json()) as PollData) : null;
  } catch {
    return null;
  }
}
