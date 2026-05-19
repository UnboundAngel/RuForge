/**
 * Offline duplicate-match probe (no Tauri). Run from repo root:
 *   node scripts/diag-duplicate-skip.mjs [targetUrl] [libraryDir]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function extractYouTubeVideoId(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const short = trimmed.match(/(?:^|\/\/)(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (short?.[1] && YT_ID_RE.test(short[1])) return short[1];
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (YT_ID_RE.test(id)) return id;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && YT_ID_RE.test(v)) return v;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeYouTubeUrlForCompare(input) {
  const id = extractYouTubeVideoId(input);
  if (id) return `youtube:${id}`;
  return input.trim().toLowerCase();
}

function youtubeUrlsMatch(a, b) {
  const idA = extractYouTubeVideoId(a);
  const idB = extractYouTubeVideoId(b);
  if (idA && idB) return idA === idB;
  return normalizeYouTubeUrlForCompare(a) === normalizeYouTubeUrlForCompare(b);
}

function findLibraryDuplicate(targetUrl, files) {
  const targetId = extractYouTubeVideoId(targetUrl);
  for (const file of files) {
    const source = file.sourceUrl?.trim();
    if (!source) continue;
    const sourceId = extractYouTubeVideoId(source);
    if (targetId && sourceId && targetId === sourceId) {
      return { file, matchedVia: "video_id" };
    }
    if (youtubeUrlsMatch(targetUrl, source)) {
      return { file, matchedVia: "url" };
    }
  }
  return null;
}

const MEDIA_EXT = new Set(["mp4", "mkv", "webm", "m4a", "mp3", "opus", "wav", "mov", "avi"]);

function scanDir(dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (!st.isFile()) continue;
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!MEDIA_EXT.has(ext)) continue;
    const stem = path.basename(name, path.extname(name));
    const infoPath = path.join(dir, `${stem}.info.json`);
    let sourceUrl = null;
    if (fs.existsSync(infoPath)) {
      try {
        const json = JSON.parse(fs.readFileSync(infoPath, "utf8"));
        sourceUrl = typeof json.webpage_url === "string" ? json.webpage_url : null;
      } catch {
        sourceUrl = null;
      }
    }
    files.push({ name, path: full, sourceUrl });
  }
  return files;
}

const targetUrl =
  process.argv[2] ?? "https://www.youtube.com/watch?v=DWCl2dN6hpg";
const libraryDir =
  process.argv[3] ?? path.join(repoRoot, "target", "audio-only-verify");

const files = scanDir(libraryDir);
const match = findLibraryDuplicate(targetUrl, files);

console.log(
  JSON.stringify(
    {
      targetUrl,
      targetId: extractYouTubeVideoId(targetUrl),
      libraryDir,
      mediaFileCount: files.length,
      match,
      rows: files.map((f) => ({
        name: f.name,
        sourceUrl: f.sourceUrl,
        sourceId: f.sourceUrl ? extractYouTubeVideoId(f.sourceUrl) : null,
        idMatch:
          extractYouTubeVideoId(targetUrl) &&
          f.sourceUrl &&
          extractYouTubeVideoId(f.sourceUrl) === extractYouTubeVideoId(targetUrl),
        urlMatch: f.sourceUrl ? youtubeUrlsMatch(targetUrl, f.sourceUrl) : false,
      })),
    },
    null,
    2,
  ),
);
