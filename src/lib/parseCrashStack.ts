import { highlightCrashLine } from "@/lib/highlightCrashLine";

export type CrashErrorSection = {
  id: string;
  file: string;
  languageLabel: string;
  lineHint: string;
  caption?: string;
  body: string;
  defaultOpen?: boolean;
};

export type ParsedCrashDetails = {
  sections: CrashErrorSection[];
  fullText: string;
};

export type ParseCrashDetailsOptions = {
  errorName?: string;
  /** Richer stack for copy-all when component + JS stacks differ. */
  copyDetail?: string;
};

const STACK_AT_NAMED = /^at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/;
const STACK_AT_PATH = /^at\s+(.+):(\d+):(\d+)$/;

type RawFrame = {
  id: string;
  file: string;
  line: string;
  col: string;
  fn?: string;
  raw: string;
};

function stripUrlPrefix(path: string): string {
  const withoutQuery = path.split("?")[0];
  try {
    const url = new URL(withoutQuery);
    const pathname = url.pathname;
    const srcIdx = pathname.indexOf("/src/");
    if (srcIdx >= 0) return pathname.slice(srcIdx + 1);
    return pathname.replace(/^\//, "");
  } catch {
    return withoutQuery;
  }
}

function parseStackLine(line: string): RawFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const named = trimmed.match(STACK_AT_NAMED);
  if (named) {
    const [, fn, file, lineNum, col] = named;
    const path = stripUrlPrefix(file);
    return {
      id: `${path}:${lineNum}:${col}:${fn}`,
      file: path,
      line: lineNum,
      col,
      fn: fn.trim(),
      raw: trimmed,
    };
  }

  const pathOnly = trimmed.match(STACK_AT_PATH);
  if (pathOnly) {
    const [, file, lineNum, col] = pathOnly;
    const path = stripUrlPrefix(file);
    return {
      id: `${path}:${lineNum}:${col}`,
      file: path,
      line: lineNum,
      col,
      raw: trimmed,
    };
  }

  return null;
}

function languageFromPath(file: string): string {
  const ext = file.includes(".") ? file.slice(file.lastIndexOf(".")) : "";
  if (ext === ".rs") return "Rust";
  if (ext === ".tsx") return "TSX";
  if (ext === ".ts") return "TypeScript";
  if (ext === ".jsx") return "JSX";
  if (ext === ".js") return "JavaScript";
  return "Stack";
}

function isAppSourceFrame(file: string): boolean {
  return file.startsWith("src/") && !file.includes("node_modules");
}

function isInternalRuntimeFrame(frame: RawFrame): boolean {
  const file = frame.file.toLowerCase();
  if (file.includes("node_modules")) return true;
  if (file.includes("react-dom")) return true;
  if (
    frame.fn
    && /^(renderWithHooks|updateFunctionComponent|beginWork|performUnitOfWork|workLoopSync)/.test(
      frame.fn,
    )
  ) {
    return true;
  }
  return false;
}

export function inferErrorName(message: string, explicitName?: string): string {
  if (explicitName && explicitName !== "Error") return explicitName;
  const head = message.split("\n")[0]?.trim() ?? message;
  const prefixed = head.match(/^([A-Z][A-Za-z]+Error):/);
  if (prefixed) return prefixed[1];
  if (/Cannot read properties of (undefined|null)/.test(head)) return "TypeError";
  if (/is not a function/.test(head)) return "TypeError";
  if (/is not defined/.test(head)) return "ReferenceError";
  if (/Invalid regular expression/.test(head)) return "SyntaxError";
  return explicitName ?? "Error";
}

export function formatCrashMessage(message: string, errorName?: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "Unknown error";
  const name = inferErrorName(trimmed, errorName);
  if (trimmed.startsWith(`${name}:`)) return trimmed;
  return `${name}: ${trimmed}`;
}

function sectionFromFrame(frame: RawFrame): CrashErrorSection {
  const fileName = frame.file.slice(frame.file.lastIndexOf("/") + 1);
  return {
    id: frame.id,
    file: frame.file,
    languageLabel: languageFromPath(frame.file),
    lineHint: `L${frame.line}:${frame.col}`,
    caption: frame.fn
      ? `${frame.fn} · ${fileName}:${frame.line}`
      : `${fileName}:${frame.line}`,
    body: frame.raw,
    defaultOpen: false,
  };
}

export function crashBodyHtml(body: string): string {
  return `<pre class="rf-code-shiki"><code>${highlightCrashLine(body)}</code></pre>`;
}

export function parseCrashDetails(
  message: string,
  detail: string,
  options: ParseCrashDetailsOptions = {},
): ParsedCrashDetails {
  const lines = detail.split("\n");
  const frames: RawFrame[] = [];

  for (const line of lines) {
    const frame = parseStackLine(line);
    if (frame) frames.push(frame);
  }

  const nonStackLines = lines
    .filter((line) => line.trim() && !parseStackLine(line))
    .join("\n")
    .trim();

  const sections: CrashErrorSection[] = [];
  const displayMessage = formatCrashMessage(message, options.errorName);
  const errorName = inferErrorName(message, options.errorName);

  if (message.trim()) {
    sections.push({
      id: "error-message",
      file: `exception/${errorName}`,
      languageLabel: "Exception",
      lineHint: "message",
      body: displayMessage,
      defaultOpen: false,
    });
  }

  const appFrames = frames.filter(
    (frame) => isAppSourceFrame(frame.file) && !isInternalRuntimeFrame(frame),
  );

  if (appFrames[0]) {
    sections.push(sectionFromFrame(appFrames[0]));
  } else if (frames[0] && !nonStackLines) {
    sections.push(sectionFromFrame(frames[0]));
  }

  if (nonStackLines && sections.length <= 1) {
    sections.push({
      id: "runtime-details",
      file: "runtime/details",
      languageLabel: "Runtime",
      lineHint: "details",
      body: nonStackLines,
      defaultOpen: false,
    });
  }

  const stackForCopy = options.copyDetail?.trim() || detail.trim();
  const fullText = [displayMessage, stackForCopy].filter(Boolean).join("\n\n");

  return { sections, fullText };
}
