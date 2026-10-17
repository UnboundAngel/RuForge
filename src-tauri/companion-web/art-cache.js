// Eviction plan for the cover cache. Plain script so the service worker (importScripts) and vitest share it.
// `entries` is oldest first; pinned urls (saved songs) are never planned for removal.
function planArtEviction(entries, pinned, maxCount, maxBytes) {
  let count = entries.length;
  let bytes = entries.reduce((n, e) => n + e.bytes, 0);
  const drop = [];
  for (const e of entries) {
    if (count <= maxCount && bytes <= maxBytes) break;
    if (pinned.has(e.url)) continue;
    drop.push(e.url);
    count--;
    bytes -= e.bytes;
  }
  return drop;
}

if (typeof module !== "undefined") module.exports = { planArtEviction };
