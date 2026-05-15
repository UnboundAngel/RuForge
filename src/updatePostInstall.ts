const KEY = "ruforge.postInstallPayload.v1";

export type ChangeItem = {
  text: string;
  handle?: string;
};

/** Written before `downloadAndInstall`; consumed on next launch for the post-update stack. */
export type PostInstallPayload = {
  version: string;
  /** Freeform summary or intro; shown with structured lists when `additions` / `fixes` are set. */
  notes: string;
  additions?: ChangeItem[];
  fixes?: ChangeItem[];
};

/**
 * Copy for the small “update available” card (`UpdaterMainOverlays`).
 * If `body` is structured JSON, only the inner `notes` string is shown there so the card stays short
 * and does not dump raw JSON; full detail still goes through {@link buildPostInstallPayload} after install.
 */
export function teaserNotesFromUpdaterBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof o.notes === "string") return o.notes;
    } catch {
      /* fall through */
    }
  }
  return body;
}

function normalizeChangeItems(raw: unknown): ChangeItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items: ChangeItem[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      items.push({ text: x });
    } else if (x && typeof x === "object") {
      const item = x as Record<string, unknown>;
      const text = String(item.text || item.message || "");
      if (text) {
        items.push({
          text,
          handle: typeof item.handle === "string" ? item.handle : undefined,
        });
      }
    }
  }
  return items.length > 0 ? items : undefined;
}

/** If `body` is JSON `{ notes?, additions?, fixes? }`, map it for the in-app changelog; else treat as plain `notes`. */
export function buildPostInstallPayload(version: string, body: string): PostInstallPayload {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const o = JSON.parse(trimmed) as Record<string, unknown>;
      const notes = typeof o.notes === "string" ? o.notes : "";
      const additions = normalizeChangeItems(o.additions);
      const fixes = normalizeChangeItems(o.fixes);
      const hasAdd = additions && additions.length > 0;
      const hasFix = fixes && fixes.length > 0;
      if (notes || hasAdd || hasFix) {
        return {
          version,
          notes,
          ...(hasAdd ? { additions } : {}),
          ...(hasFix ? { fixes } : {}),
        };
      }
    } catch {
      /* plain text body */
    }
  }
  return { version, notes: body };
}

export function setPendingPostInstall(payload: PostInstallPayload): void {
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clearPendingPostInstall(): void {
  localStorage.removeItem(KEY);
}

/** Read and remove so the celebration UI only arms once per successful install handoff. */
export function consumePendingPostInstall(): PostInstallPayload | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  localStorage.removeItem(KEY);
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (typeof o.version !== "string") return null;
    return {
      version: o.version,
      notes: typeof o.notes === "string" ? o.notes : "",
      additions: normalizeChangeItems(o.additions),
      fixes: normalizeChangeItems(o.fixes),
    };
  } catch {
    return null;
  }
}
