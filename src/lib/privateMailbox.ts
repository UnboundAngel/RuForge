import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type EventTarget, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * An `emitTo` payload reaches every webview listening with the `Any` target, including the youtube.com
 * Explorer (it has event permission). Private state therefore goes through Rust commands, which remote
 * pages cannot call, and the event is only a ping. Keys must match `private_mailbox.rs`.
 */
export type MailboxSlotKey = "notify-overlay-state" | "desktop-island-state";
export type MailboxQueueKey =
  | "notification-center-record"
  | "notify-overlay-action"
  | "desktop-island-control";

type Slot<T> = { version: number; payload: T };

export async function postPrivateState(
  key: MailboxSlotKey,
  target: string | EventTarget,
  event: string,
  payload: unknown,
): Promise<void> {
  await invoke("private_mailbox_put", { key, payload });
  await emitTo(target, event, null);
}

/** Pulls once on attach so a receiver that loads late still gets the newest state. */
export async function listenPrivateState<T>(
  key: MailboxSlotKey,
  event: string,
  onState: (payload: T) => void,
): Promise<UnlistenFn> {
  let applied = 0;
  const pull = async () => {
    try {
      const slot = await invoke<Slot<T> | null>("private_mailbox_get", { key });
      // Two pings can resolve out of order; never step back to an older state.
      if (!slot || slot.version <= applied) return;
      applied = slot.version;
      onState(slot.payload);
    } catch (e) {
      console.error(`private_mailbox_get ${key} failed`, e);
    }
  };
  const unlisten = await listen(event, () => void pull());
  void pull();
  return unlisten;
}

export async function pushPrivateRecord(
  key: MailboxQueueKey,
  target: string | EventTarget,
  event: string,
  payload: unknown,
): Promise<void> {
  await invoke("private_mailbox_push", { key, payload });
  await emitTo(target, event, null);
}

/** Drains once on attach so records sent before the listener existed are not lost. */
export async function listenPrivateQueue<T>(
  key: MailboxQueueKey,
  event: string,
  onRecord: (payload: T) => void,
): Promise<UnlistenFn> {
  const drain = async () => {
    try {
      const records = await invoke<T[]>("private_mailbox_take", { key });
      for (const r of records) onRecord(r);
    } catch (e) {
      console.error(`private_mailbox_take ${key} failed`, e);
    }
  };
  const unlisten = await listen(event, () => void drain());
  void drain();
  return unlisten;
}
