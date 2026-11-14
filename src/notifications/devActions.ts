import { POLL_PICK_ACTIONS, type NotificationActionId, type PollPickAction } from "./types";

/** Vote buttons only while a poll is open and the user has not voted; nothing otherwise. */
export function pollActions(
  options: readonly { id: string }[],
  endsAt: number | null,
  now: number,
  voted = false,
): NotificationActionId[] {
  if (voted || (endsAt != null && endsAt <= now)) return [];
  return options
    .map((o) => `poll-pick-${o.id}`)
    .filter((a): a is PollPickAction => (POLL_PICK_ACTIONS as readonly string[]).includes(a));
}

export function pickOptionId(action: PollPickAction): string {
  return action.slice("poll-pick-".length);
}
