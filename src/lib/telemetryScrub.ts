export type TelemetryBreadcrumb = {
  message?: string;
  category?: string;
  [key: string]: unknown;
};

export type TelemetryExceptionValue = {
  type?: string;
  value?: string;
  [key: string]: unknown;
};

export type TelemetryEvent = {
  message?: string;
  exception?: {
    values?: TelemetryExceptionValue[];
  };
  breadcrumbs?: TelemetryBreadcrumb[];
  [key: string]: unknown;
};

const RE_HTTP_URL = /https?:\/\/[^\s"']+/gi;
const RE_WWW_URL = /www\.[^\s"']+/g;
const RE_WIN_PATH = /[A-Za-z]:[\\/][^\s"']*/g;
const RE_UNC_PATH = /\\\\[^\s"']+/g;
const RE_UNIX_PATH = /(?:\/home|\/Users|\/media|\/mnt|\/tmp)\/[^\s"']*/g;
const RE_COOKIE_CLI = /--cookies(?:-from-browser)?\s+\S+/g;
const RE_COOKIE_FILE = /\S*(?:cookies\.txt|\.cookies)\S*/g;
const RE_WATCH_VIDEO_ID = /watch\?v=[A-Za-z0-9_-]{11}/g;
const RE_YTDLP_LINE = /^.*(?:Downloading|Extracting|Deleting original file).*$/gm;
const RE_CONTEXT_VIDEO_ID =
  /(?:youtube|youtu\.be|watch\?v=).{0,30}?([A-Za-z0-9_-]{11})/gi;

let pathRoots: string[] = [];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRoot(raw: string): string {
  return raw.trim().replace(/\//g, "\\").replace(/\\+$/, "");
}

export function setPathRoots(roots: string[]): void {
  const normalized = roots
    .map(normalizeRoot)
    .filter((root) => root.length > 0)
    .sort((a, b) => b.length - a.length);
  pathRoots = [...new Set(normalized)];
}

function applyDynamicRoots(text: string): string {
  let out = text;
  for (const root of pathRoots) {
    out = out.replace(new RegExp(escapeRegExp(root), "gi"), "[library-path]");
  }
  return out;
}

function scrubContextVideoIds(text: string): string {
  return text.replace(RE_CONTEXT_VIDEO_ID, (match, id: string) =>
    match.replace(id, "[video-id]"),
  );
}

export function remainsSensitive(text: string): boolean {
  return (
    /https?:\/\/[^\s"']+|www\.[^\s"']+/i.test(text) ||
    /[A-Za-z]:[\\/][^\s"']*/.test(text) ||
    /\\\\[^\s"']+/.test(text) ||
    /(?:\/home|\/Users|\/media|\/mnt|\/tmp)\/[^\s"']*/.test(text) ||
    /youtube|youtu\.be|watch\?v=|music\.youtube/i.test(text)
  );
}

export function scrubText(text: string): string {
  let out = applyDynamicRoots(text);
  out = out.replace(RE_YTDLP_LINE, "[yt-dlp-output]");
  out = out.replace(RE_HTTP_URL, "[url]");
  out = out.replace(RE_WWW_URL, "[url]");
  out = out.replace(RE_UNC_PATH, "[path]");
  out = out.replace(RE_WIN_PATH, "[path]");
  out = out.replace(RE_UNIX_PATH, "[path]");
  out = out.replace(RE_COOKIE_CLI, "--cookies [redacted]");
  out = out.replace(RE_COOKIE_FILE, "[cookie-file]");
  out = out.replace(RE_WATCH_VIDEO_ID, "watch?v=[video-id]");
  return scrubContextVideoIds(out);
}

export function scrubTextOrDrop(text: string): string | null {
  const scrubbed = scrubText(text);
  return remainsSensitive(scrubbed) ? null : scrubbed;
}

export function telemetryBeforeBreadcrumb(
  breadcrumb: TelemetryBreadcrumb,
): TelemetryBreadcrumb | null {
  if (breadcrumb.category === "console") {
    return null;
  }
  if (breadcrumb.message == null || breadcrumb.message === "") {
    return breadcrumb;
  }
  const scrubbed = scrubTextOrDrop(breadcrumb.message);
  if (scrubbed === null) {
    return null;
  }
  return { ...breadcrumb, message: scrubbed };
}

export function telemetryBeforeSend(event: TelemetryEvent): TelemetryEvent | null {
  let next: TelemetryEvent = { ...event };

  if (next.message != null && next.message !== "") {
    const scrubbed = scrubTextOrDrop(next.message);
    if (scrubbed === null) {
      return null;
    }
    next = { ...next, message: scrubbed };
  }

  if (next.exception?.values?.length) {
    const values: TelemetryExceptionValue[] = [];
    for (const entry of next.exception.values) {
      const scrubbedType = scrubText(entry.type ?? "");
      if (remainsSensitive(scrubbedType)) {
        return null;
      }
      const rawValue = entry.value ?? "";
      const scrubbedValue = scrubTextOrDrop(rawValue);
      if (scrubbedValue === null) {
        return null;
      }
      values.push({ ...entry, type: scrubbedType, value: scrubbedValue });
    }
    next = { ...next, exception: { ...next.exception, values } };
  }

  if (next.breadcrumbs?.length) {
    const breadcrumbs: TelemetryBreadcrumb[] = [];
    for (const crumb of next.breadcrumbs) {
      const scrubbed = telemetryBeforeBreadcrumb(crumb);
      if (scrubbed !== null) {
        breadcrumbs.push(scrubbed);
      }
    }
    next = { ...next, breadcrumbs };
  }

  return next;
}
