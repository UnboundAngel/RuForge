// App shell cache so the Home Screen app opens when the PC is off or unreachable.
// Only the shell is handled here; API and stream requests go straight to the network; covers use the rf-art cache.
importScripts("/art-cache.js");

const SHELL = "rf-shell-60943ca45d";
const ART = "rf-art";
const ART_PINS = "/__art-pins";
const ART_MAX_COUNT = 4000;
const ART_MAX_BYTES = 200 * 1024 * 1024;
const NAV_TIMEOUT_MS = 3000;
const STATIC = ["/manifest.webmanifest", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];

const assetsOf = (html) => [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

// `previous` is the shell the open page may still be loading from, so its assets survive one more update.
async function cacheShell(html, previous = "") {
  const cache = await caches.open(SHELL);
  const assets = assetsOf(html);
  const keep = new Set(["/", ...STATIC, ...assets, ...assetsOf(previous)]);
  const fetchInto = async (u) => {
    if (await cache.match(u)) return;
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) await cache.put(u, res);
    } catch {}
  };
  await Promise.all([...keep].filter((u) => u !== "/").map(fetchInto));
  for (const css of [...keep].filter((u) => u.endsWith(".css"))) {
    const hit = await cache.match(css);
    if (!hit) continue;
    for (const m of (await hit.text()).matchAll(/url\(["']?(\/assets\/[^)"']+)/g)) {
      keep.add(m[1]);
      await fetchInto(m[1]);
    }
  }
  for (const req of await cache.keys()) {
    if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
  }
}

async function storeIndex(res) {
  const html = await res.clone().text();
  const cache = await caches.open(SHELL);
  const prior = await cache.match("/");
  const previous = prior ? await prior.text() : "";
  await cache.put("/", res.clone());
  await cacheShell(html, previous === html ? "" : previous);
  return previous !== "" && previous !== html;
}

async function announceUpdate() {
  for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "shell-updated" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch("/", { cache: "no-store" });
        if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) await storeIndex(res);
      } catch {}
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("rf-shell-") && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

// Cache first: a dead PC must not hold the first paint. The fresh shell lands for the next launch.
async function navigate(event) {
  const hit = await caches.match("/", { ignoreSearch: true });
  const refresh = fetch(event.request).then(async (res) => {
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.includes("text/html") && (await storeIndex(res.clone()))) await announceUpdate();
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  try {
    return await Promise.race([
      refresh,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
  } catch {
    return fetch(event.request);
  }
}

async function readPins(cache) {
  const hit = await cache.match(ART_PINS);
  return new Set(hit ? await hit.json() : []);
}

async function trimArt(cache) {
  const entries = [];
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path === ART_PINS) continue;
    const res = await cache.match(req);
    entries.push({ url: req.url, bytes: Number(res?.headers.get("content-length")) || 20_000 });
  }
  const drop = planArtEviction(entries, await readPins(cache), ART_MAX_COUNT, ART_MAX_BYTES);
  for (const url of drop) await cache.delete(url);
}

// The URL carries the cover version, so a hit never needs revalidating. A hit is moved to the newest slot.
async function art(event) {
  const cache = await caches.open(ART);
  const hit = await cache.match(event.request);
  if (hit) {
    const keep = hit.clone();
    event.waitUntil(cache.delete(event.request).then(() => cache.put(event.request, keep)));
    return hit;
  }
  const res = await fetch(event.request);
  if (res.ok) {
    event.waitUntil(cache.put(event.request, res.clone()).then(() => trimArt(cache)));
  }
  return res;
}

// Saved songs keep their covers: the page sends the full list of art urls whenever the saved set changes.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || (data.type !== "art-pins" && data.type !== "art-clear")) return;
  event.waitUntil(
    (async () => {
      if (data.type === "art-clear") {
        await caches.delete(ART);
        return;
      }
      const cache = await caches.open(ART);
      const urls = (Array.isArray(data.urls) ? data.urls : []).map((u) => new URL(u, self.location.origin).href);
      await cache.put(ART_PINS, new Response(JSON.stringify(urls), { headers: { "content-type": "application/json" } }));
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && (url.pathname === "/" || url.pathname === "/paired")) {
    event.respondWith(navigate(event));
    return;
  }

  if (url.pathname.startsWith("/art/")) {
    event.respondWith(art(event));
    return;
  }

  if (url.pathname.startsWith("/assets/") || STATIC.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req)),
    );
  }
});
