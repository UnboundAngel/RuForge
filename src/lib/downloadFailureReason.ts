export type DownloadFailureKind =
  | "private"
  | "deleted"
  | "members_only"
  | "age_restricted"
  | "region_blocked"
  | "network"
  | "other";

type Rule = { kind: DownloadFailureKind; test: RegExp; message: string };

// Order matters: a private video's text also mentions "sign in", and removed videos say "unavailable".
// Each message matches its own rule so a stored reason classifies the same on a later read.
const RULES: Rule[] = [
  {
    kind: "private",
    test: /private video|this video is private/i,
    message: "Private video. Only its owner can watch it.",
  },
  {
    kind: "members_only",
    test: /members-only|members only|join this channel|channel membership/i,
    message: "Members-only video. Join the channel to download it.",
  },
  {
    kind: "age_restricted",
    test: /confirm your age|age-restricted|age restricted|inappropriate for some users/i,
    message: "Age-restricted video. Sign in with an adult account to download it.",
  },
  {
    kind: "region_blocked",
    test: /in your country|not available in your region|geo.?restrict|region.?blocked|blocked it in/i,
    message: "Not available in your region.",
  },
  {
    kind: "deleted",
    test: /video unavailable|has been removed|was removed|deleted|no longer available|account .* terminated|video is unavailable|this video is not available/i,
    message: "Deleted or unavailable video.",
  },
  {
    kind: "network",
    test: /timed out|timeout|connection (reset|aborted|refused)|network|unable to download|temporary failure|name resolution|http error 5\d\d|read error|ssl/i,
    message: "Network problem or timeout. Try again.",
  },
];

/** Reasons that cannot change by retrying; the auto-retry sweep leaves these alone. */
const NO_AUTO_RETRY: ReadonlySet<DownloadFailureKind> = new Set(["private", "deleted", "members_only"]);

export function classifyDownloadFailure(raw: string | null | undefined): DownloadFailureKind {
  const text = (raw ?? "").trim();
  if (!text) return "other";
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.kind;
  }
  return "other";
}

/** Plain-language reason for known failures; unknown errors keep their original text. */
export function plainDownloadFailureMessage(raw: string | null | undefined): string | null {
  const kind = classifyDownloadFailure(raw);
  if (kind === "other") return raw ?? null;
  return RULES.find((r) => r.kind === kind)?.message ?? raw ?? null;
}

/** `timed_out` jobs retry; failed jobs retry unless the reason is permanent. */
export function shouldAutoRetryFailure(
  status: "failed" | "timed_out",
  raw: string | null | undefined,
): boolean {
  if (status === "timed_out") return true;
  return !NO_AUTO_RETRY.has(classifyDownloadFailure(raw));
}
