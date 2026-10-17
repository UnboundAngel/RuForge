import { listen } from "@tauri-apps/api/event";
import { recordNotification } from "@/notifications/recordNotification";
import { listenPrivateQueue } from "@/lib/privateMailbox";

/**
 * Event names nothing in RuForge emits. A YouTube page can emit any event name, so receiving one
 * means a page is probing (the decoy `window.__RUFORGE_INTERNALS__` in `explorer_decoy.js` emits
 * the first). Tripwires only log and show one bell row; they never block or close anything.
 */
export const DECOY_EVENTS = ["ruforge-admin-exec", "debug-shell", "export-cookies"] as const;

/** Rust `nav_guard.rs` pushes `{ kind, surface, target }` here and pings `main`. */
export const SECURITY_TRIP_EVENT = "security-trip";

type NavigationTrip = { kind: "navigation"; surface: string; target: string };

const reported = new Set<string>();

/** One bell row per key per session; later trips only log. */
export function recordSecurityTrip(key: string, title: string, subtitle: string, now = Date.now()): boolean {
  console.warn(`[security] ${title}: ${subtitle}`);
  if (reported.has(key)) return false;
  reported.add(key);
  recordNotification({
    id: `security:${key}`,
    source: "security",
    kind: "security-blocked",
    title,
    subtitle,
    thumbnail: null,
    channelId: null,
    createdAt: now,
    read: false,
    actions: [],
    ref: {},
  });
  return true;
}

function isNavigationTrip(value: unknown): value is NavigationTrip {
  const v = value as NavigationTrip | null;
  return (
    !!v &&
    typeof v === "object" &&
    v.kind === "navigation" &&
    typeof v.surface === "string" &&
    typeof v.target === "string"
  );
}

export function navigationTripText(trip: NavigationTrip): { key: string; title: string; subtitle: string } {
  const surface = trip.surface === "Music" ? "Music" : "Explorer";
  const target = trip.target.slice(0, 120);
  return {
    key: `nav:${target.toLowerCase()}`,
    title: `A page in ${surface} tried to open a blocked address`,
    subtitle: target,
  };
}

/** Main window only, alongside the notification center. */
export async function startSecurityTripwires(): Promise<() => void> {
  const unlisteners: Array<() => void> = [];
  try {
    unlisteners.push(
      await listenPrivateQueue<unknown>("security-trip", SECURITY_TRIP_EVENT, (record) => {
        if (!isNavigationTrip(record)) return;
        const { key, title, subtitle } = navigationTripText(record);
        recordSecurityTrip(key, title, subtitle);
      }),
    );
    for (const name of DECOY_EVENTS) {
      unlisteners.push(
        await listen(name, () => {
          recordSecurityTrip(`decoy:${name}`, "A page in Explorer or Music probed for RuForge internals", `Tripwire: ${name}`);
        }),
      );
    }
  } catch (e) {
    console.error("security tripwires listen failed", e);
  }
  return () => {
    for (const un of unlisteners) un();
  };
}
