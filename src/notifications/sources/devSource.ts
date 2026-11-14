import { openUrl } from "@tauri-apps/plugin-opener";
import { pickOptionId, pollActions } from "../devActions";
import { castVote, useDevVotesStore, type PollVote } from "../devVotes";
import { markAllLocalRead, markLocalRead, useNotificationCenterStore } from "../notificationCenterStore";
import { isPollPick, type NotificationItem, type NotificationSource } from "../types";

let memo: { local: NotificationItem[]; votes: Record<string, PollVote>; items: NotificationItem[] } | null = null;

const pollId = (item: NotificationItem) => item.id.slice("dev:".length);

/** Options stay clickable until the user votes or the poll ends; results only show after that. */
function withPollState(item: NotificationItem, votes: Record<string, PollVote>): NotificationItem {
  if (item.kind !== "dev-poll") return item;
  const vote = votes[pollId(item)];
  const endsAt = item.ref.endsAt ?? null;
  const closed = endsAt != null && endsAt <= Date.now();
  const showResults = closed || !!vote?.pick;
  return {
    ...item,
    actions: pollActions(item.ref.devOptions ?? [], endsAt, Date.now(), !!vote?.pick),
    ref: {
      ...item.ref,
      devVote: {
        pick: vote?.pick ?? null,
        counts: showResults ? (vote?.counts ?? null) : null,
        error: vote?.error ?? null,
        busy: vote?.busy ?? false,
      },
    },
  };
}

function items(): NotificationItem[] {
  const { local } = useNotificationCenterStore.getState();
  const { votes } = useDevVotesStore.getState();
  if (memo && memo.local === local && memo.votes === votes) return memo.items;
  const next = local
    .filter((i) => i.source === "dev")
    .map((i) => withPollState(i, votes))
    .sort((a, b) => b.createdAt - a.createdAt);
  memo = { local, votes, items: next };
  return next;
}

/** Signed announcements from the developer. Links are fixed to ruforge.app by the Rust verifier. */
export const devSource: NotificationSource = {
  id: "dev",
  items,
  markRead: (ids) => markLocalRead(ids),
  markAllRead: () => markAllLocalRead(),
  runAction: async (item, action) => {
    if (isPollPick(action)) return castVote(pollId(item), pickOptionId(action));
    if (item.ref.devUrl) await openUrl(item.ref.devUrl);
  },
  subscribe: (onChange) => {
    const offLocal = useNotificationCenterStore.subscribe((st, prev) => {
      if (st.local !== prev.local) onChange();
    });
    const offVotes = useDevVotesStore.subscribe((st, prev) => {
      if (st.votes !== prev.votes) onChange();
    });
    return () => {
      offLocal();
      offVotes();
    };
  },
};
