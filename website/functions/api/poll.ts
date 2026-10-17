import { isClosed, loadSignedItems, todayUtc, type AnnouncementItem } from "../_shared/announcements";
import { sha256Hex } from "../_shared/hash";
import type { Env, PagesHandler } from "../_shared/types";

const VOTES_PER_IP_PER_DAY = 20;
const VOTER_RE = /^[0-9a-f]{32}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const fail = (status: number, error: string) => json({ error }, status);

async function findPoll(env: Env, request: Request, id: string): Promise<AnnouncementItem | Response> {
  const items = await loadSignedItems(env, request);
  if (!items) return fail(503, "unavailable");
  const poll = items.find((item) => item.id === id);
  if (!poll) return fail(404, "unknown_poll");
  if (poll.kind !== "poll" || !poll.options?.length) return fail(400, "not_a_poll");
  return poll;
}

async function results(env: Env, poll: AnnouncementItem, voterHash: string | null): Promise<Response> {
  const counts = await env.POLLS.prepare("SELECT option_id, COUNT(*) AS n FROM votes WHERE poll_id = ? GROUP BY option_id")
    .bind(poll.id)
    .all<{ option_id: string; n: number }>();
  const byOption = new Map(counts.results.map((row) => [row.option_id, row.n]));
  const options = (poll.options ?? []).map((o) => ({ id: o.id, label: o.label, count: byOption.get(o.id) ?? 0 }));
  const voted = voterHash
    ? await env.POLLS.prepare("SELECT option_id FROM votes WHERE poll_id = ? AND voter = ?")
        .bind(poll.id, voterHash)
        .first<{ option_id: string }>()
    : null;
  return json({
    id: poll.id,
    title: poll.title,
    body: poll.body,
    ends: poll.ends ?? null,
    closed: isClosed(poll),
    options,
    total: options.reduce((sum, o) => sum + o.count, 0),
    voted: voted?.option_id ?? null,
  });
}

// Salted per poll so one voter id cannot be linked across polls from the table.
const voterHashFor = (env: Env, voter: string, pollId: string) => sha256Hex(`${voter}:${pollId}:${env.VOTE_SALT}`);

export const onRequestGet: PagesHandler = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) return fail(400, "missing_id");
  const poll = await findPoll(env, request, id);
  if (poll instanceof Response) return poll;
  const voter = url.searchParams.get("voter") ?? "";
  return results(env, poll, VOTER_RE.test(voter) ? await voterHashFor(env, voter, id) : null);
};

export const onRequestPost: PagesHandler = async ({ request, env }) => {
  let body: { id?: unknown; option?: unknown; voter?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_json");
  }
  const { id, option, voter } = body;
  if (typeof id !== "string" || typeof option !== "string" || typeof voter !== "string" || !VOTER_RE.test(voter)) {
    return fail(400, "bad_request");
  }
  const poll = await findPoll(env, request, id);
  if (poll instanceof Response) return poll;
  if (isClosed(poll)) return fail(410, "closed");
  if (!poll.options?.some((o) => o.id === option)) return fail(400, "unknown_option");

  const voterHash = await voterHashFor(env, voter, id);
  const existing = await env.POLLS.prepare("SELECT 1 AS x FROM votes WHERE poll_id = ? AND voter = ?").bind(id, voterHash).first();
  if (existing) return results(env, poll, voterHash);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ipHash = await sha256Hex(`${ip}:${env.VOTE_SALT}`);
  const day = todayUtc();
  const used = await env.POLLS.prepare("SELECT n FROM ip_counts WHERE poll_id = ? AND ip_hash = ? AND day = ?")
    .bind(id, ipHash, day)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= VOTES_PER_IP_PER_DAY) return fail(429, "rate_limited");

  await env.POLLS.batch([
    env.POLLS.prepare("INSERT OR IGNORE INTO votes (poll_id, voter, option_id, created_at) VALUES (?, ?, ?, ?)").bind(
      id,
      voterHash,
      option,
      Math.floor(Date.now() / 1000),
    ),
    env.POLLS.prepare(
      "INSERT INTO ip_counts (poll_id, ip_hash, day, n) VALUES (?, ?, ?, 1) ON CONFLICT(poll_id, ip_hash, day) DO UPDATE SET n = n + 1",
    ).bind(id, ipHash, day),
  ]);
  return results(env, poll, voterHash);
};
