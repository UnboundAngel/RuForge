# Companion and competitor doc index

Agent-facing map of where companion LAN architecture, competitor research, and related code live. Read this when the task touches companion pairing, LAN streaming, browser client, or "how do competitors do X."

**Live code wins over docs.** If this index disagrees with `src-tauri/src/companion/` or `companion-web/index.html`, trust the code and fix this file forward.

---

## Quick routing (trigger words)

| If the task mentions… | Open first | Then |
|----------------------|------------|------|
| companion, LAN server, QR pair, session cookie, `/pair`, `/library`, `/stream`, HMAC signed URL, companion-web, phone browser, axum companion | **`docs/research/companion-architecture-extraction.md`** Part 2 | Code: `src-tauri/src/companion/` |
| Jellyfin, Navidrome, PairDrop, Snapdrop, go2rtc, MediaMTX, PlaybackInfo, Subsonic, Quick Connect, embed.FS, ServeContent, range 206 | **`docs/research/companion-architecture-extraction.md`** Part 1 (+ Part 3 borrow table) | Part 2 for RuForge target design |
| what to copy vs not copy from upstream servers | **`docs/research/companion-architecture-extraction.md`** Part 3 | Part 2 reconciliation section |
| Parabolic, imsyy, ytdlp-interface, dsymbol, yt-dlp GUI comparison, downloader-only competitor, feature matrix | **`docs/research/ruforge-competitive-audit.md`** | Not for companion LAN |
| 4K Video Downloader, winget competitors, SEO rivals, "alternative to", marketing competitors | **`docs/research/google-seo-and-domain-strategy.md`** §7 | **`docs/research/ruforge-competitive-audit.md`** for product features |
| public roadmap status for browser companion | **`website/src/content/roadmap.json`** (search `Browser companion`) | **`STATE.md`** / **`AGENTS.md`** Shipped log for in-tree reality |
| companion UI polish, loading screen, pairing modal, QR styling | **`src-tauri/companion-web/index.html`**, **`CompanionPairingModal.tsx`**, **`companionQr.ts`** | Design taste: **`.cursor/rules/design-style.mdc`** |
| companion dev gate, debugging settings | **`CompanionSettingsSection.tsx`**, `showDebuggingSettings` in store | Companion is dev-gated only until released |

---

## Canonical companion architecture doc

**Path:** `docs/research/companion-architecture-extraction.md`

**What it is:** Competitive architecture extraction for RuForge companion LAN v1 (browser-only). Compares four upstream server projects, synthesizes RuForge's target design, and lists patterns to borrow or reject.

**Locked v1 assumptions (doc + code intent):**
- Untrusted browsers on LAN only
- Same-origin SPA served by embedded axum server inside Tauri
- Default-deny CORS
- Session HttpOnly cookie for JSON APIs
- HMAC signed short-TTL URLs for media bytes (so `<video>` needs no auth header)
- QR pairing with single-use code in `/?c=`
- HTTP Range (206) of original files, no transcode in v1
- `playable` flag per catalog item from container/codec probe

**Structure:**

| Section | Contents |
|---------|----------|
| **Part 1** | Per-project architecture maps (Jellyfin, Navidrome, Snapdrop/PairDrop, go2rtc + MediaMTX) |
| **Part 2** | RuForge companion template: endpoints, auth lifecycle, CORS, streaming rules, pairing, security boundaries, performance, state model |
| **Part 3** | Code extraction map: borrow table + explicit "do not copy" list |

**Note:** Doc references `.cursor/plans/companion_lan_server_a1f7c239.plan.md`. That plan file is not in the repo; Part 2 is the surviving plan surface.

**Trigger words:** `companion`, `LAN`, `pairing code`, `session token`, `stream-token`, `signed URL`, `range request`, `206`, `playable`, `CORS`, `QR`, `companion-web`, `axum`, `embed SPA`, `no transcode`, `browser-only`, `Quick Connect`, `api_key anti-pattern`, `Shares public URL`, `PairDrop roomSecret`, `go2rtc ladder`, `ffprobe`, `faststart`

---

## Part 1 competitors (architecture references)

These are **not** RuForge product competitors. They are **upstream server projects** studied for LAN streaming and pairing patterns.

### 1. Jellyfin

**Role in doc:** Maximalist reference. Maps what RuForge v1 deliberately avoids.

**Layout summary:**
- **Server:** ASP.NET Core, `Jellyfin.Api` controllers (`ItemsController`, `VideosController`, `AudioController`, `DynamicHlsController`, `ImageController`, `MediaInfoController`, `QuickConnectController`, …)
- **Domain:** `MediaBrowser.Controller`, `MediaBrowser.Model`, `Emby.Server.Implementations`
- **Persistence:** SQLite (`library.db`, `jellyfin.db`)
- **Client:** Separate `jellyfin-web` SPA repo; auth via `X-Emby-Authorization` header or `api_key` query on media URLs
- **Pipeline:** `PlaybackInfo` negotiates Direct Play vs remux vs HLS transcode; ffmpeg does heavy lifting

**Key lessons for RuForge:** Negotiate-then-stream (collapsed to `playable: bool`), range on static direct-play path, opaque item IDs, single auth choke point. **Anti-pattern:** long-lived `api_key` in query strings.

**Trigger words:** `Jellyfin`, `Emby`, `PlaybackInfo`, `DeviceProfile`, `Direct Play`, `HLS transcode`, `Quick Connect`, `api_key query`, `FileStreamResponseHelpers`, `InvalidAuthProvider`, `IAuthorizationContext`, `multi-user`, `DLNA`, `plugin`

---

### 2. Navidrome

**Role in doc:** Closest structural match to RuForge v1: one binary, embedded UI, stream with range, home-server scale.

**Layout summary:**
- **Server:** Go; `server/`, `server/subsonic/`, `server/nativeapi/`, `core/`, `model/`, `persistence/`, `scanner/`
- **Client:** React admin UI embedded via Go `embed.FS`; third-party Subsonic apps also supported
- **Auth:** Subsonic query-param token scheme (weak) + JWT for native UI; Shares feature uses signed public URLs for headerless media fetch
- **Pipeline:** `GET /rest/stream` with `http.ServeContent` for range/206; optional transcode per player rules

**Key lessons for RuForge:** Single binary + embedded SPA (`rust-embed`), `ServeFile` must match ServeContent semantics, catalog + stream + thumb endpoints, signed URL tier for `<video>`/`<img>`, artwork cache.

**Trigger words:** `Navidrome`, `Subsonic`, `embed.FS`, `ServeContent`, `getCoverArt`, `getAlbumList2`, `Shares`, `CreatePublicToken`, `publicurl`, `serveStream`, `SQLite`, `reverse proxy auth`, `md5 password salt`

---

### 3. Snapdrop / PairDrop

**Role in doc:** Pairing and discovery only. Server is WebSocket signaling; files never cross the server (P2P). RuForge does **not** copy P2P.

**Layout summary:**
- **Server:** Node.js WebSocket broker (`ws`), SDP/ICE signaling between browsers
- **Pairing:** Short codes, room secrets, persistent vs ephemeral credential split
- **Discovery:** Same-public-IP auto-discovery (doc flags as privacy footgun to avoid)

**Key lessons for RuForge:** QR `/?c=` then `POST /pair`; single-use code killed on redeem; durable session separate from ephemeral code; validate credential shape before trust; friendly device labels.

**Trigger words:** `PairDrop`, `Snapdrop`, `WebRTC`, `signaling`, `pair key`, `roomSecret`, `_createPairKey`, `discovery`, `same IP`, `6-digit code`, `rate limit pairing`

---

### 4. go2rtc (+ MediaMTX secondary)

**Role in doc:** Streaming delivery ladder and when to shell to ffmpeg. MediaMTX cited for HLS-as-fallback reference only, not v1.

**Layout summary:**
- **go2rtc:** Single binary, embedded web UI, probes codecs per stream, repackages or shells ffmpeg for mismatch; refuses to embed a full transcoder
- **MediaMTX:** RTSP/HLS muxer patterns for universal-compat floor (future, not v1)

**Key lessons for RuForge:** Per-item playable decision from codec/container probe; keep heavy work in ffmpeg only when needed; never expose command-executing endpoints; v1 is direct-play + range only.

**Trigger words:** `go2rtc`, `MediaMTX`, `delivery ladder`, `codec probe`, `remux`, `faststart`, `moov atom`, `exec source`, `WHEP`, `RTSP`, `camera streaming`, `transcode fallback`

---

## yt-dlp GUI competitive audit (product competitors)

**Path:** `docs/research/ruforge-competitive-audit.md`

**What it is:** Feature comparison of **four yt-dlp desktop GUIs vs RuForge** (downloader product surface, not LAN companion). Dated 2026-05-21; version header may lag `STATE.md`.

**Competitors covered:**

| Project | Stack | Positioning |
|---------|-------|-------------|
| **Parabolic** (NickvisionApps) | .NET, GTK/WinUI | Multi-platform downloader; extensions; no integrated library player |
| **yt-dlp-gui** (dsymbol) | Python, single window | Minimal one-screen wrapper; `config.toml` presets; downloader only |
| **ytdlp-interface** (ErrorFlynn) | Windows C++, Nana GUI | Portable 7z; format picker sub-windows; queue table; no library |
| **imsyy yt-dlp-gui** | Tauri 2 + Vue | Closest stack peer; extension URL handoff; tools hub; no RuForge-class library player |

**Also in doc:** Wide feature matrix (queue, cookies, SponsorBlock, updater, shortcuts), gaps RuForge has vs lacks, disposition lines for roadmap thinking.

**Explicitly out of scope in doc:** Motrix, FreeTube, CLI yt-dlp.

**Trigger words:** `competitive audit`, `Parabolic`, `imsyy`, `ytdlp-interface`, `dsymbol`, `yt-dlp gui`, `feature matrix`, `downloader comparison`, `4K alternative` (product features, not SEO), `Tauri competitor GUI`, `who has library player`, `SponsorBlock competitor`, `browser extension handoff`

---

## SEO / acquisition competitors

**Path:** `docs/research/google-seo-and-domain-strategy.md` (§7 Competitor Analysis)

**What it is:** Market and SEO rivals for **website discovery**, not codebase layout.

**Names in doc:** 4K Video Downloader Plus, Open Video Downloader (jely2002), HalalDL, imsyy yt-dlp-gui, Alpha Tube, SnapDownloader, comparison-content strategy, winget/AlternativeTo angles.

**Trigger words:** `SEO competitor`, `4kdownload`, `parasite SEO`, `AlternativeTo`, `winget`, `comparison page`, `yt-dlp gui windows keyword`, `GitHub-only competitor`, `aggregateRating` (do not fake)

**Related:** `docs/research/ai-llm-discoverability.md` (llms.txt, IndexNow, AI citation). `website/public/llms.txt` (live site index).

---

## Live companion implementation (code map)

Dev-gated behind `showDebuggingSettings` until released. **`STATE.md`** and **`AGENTS.md`** Shipped log describe what is in tree.

| Path | Role |
|------|------|
| `src-tauri/src/companion/mod.rs` | Server lifecycle, `CompanionState`, sessions, pairing codes, default port 8787 |
| `src-tauri/src/companion/routes.rs` | axum routes: `/pair`, `/library`, `/stream`, SPA fallback, `/paired` |
| `src-tauri/src/companion/auth.rs` | Session + HMAC signed URL validation |
| `src-tauri/src/companion/spa.rs` | Embedded `companion-web` static assets |
| `src-tauri/src/companion/commands.rs` | Tauri commands for desktop settings/status |
| `src-tauri/companion-web/index.html` | Browser SPA (single file: HTML, CSS, JS) |
| `src/components/settings/CompanionSettingsSection.tsx` | Settings UI: enable, QR, open in browser |
| `src/components/settings/CompanionPairingModal.tsx` | Desktop pairing QR modal |
| `src/lib/companionQr.ts` | QR generation (ECC H, RuForge icon overlay) |

**Trigger words:** `CompanionState`, `PairingCode`, `DEFAULT_PORT 8787`, `companion-web`, `CompanionPairingModal`, `companionQr`, `showDebuggingSettings`, `routes.rs`, `spa.rs`

---

## Roadmap and status surfaces

| Path | Use |
|------|-----|
| `website/src/content/roadmap.json` | Public row: **"Browser companion support for phone, desktop, and TV"** (`appArea`: Browser, `roadmapStatus`: progress) |
| `STATE.md` | What is in tree vs last shipped |
| `AGENTS.md` → Shipped log | Per-change companion LAN lines under `v0.2.2 (unreleased)` |
| `docs/RuForge.md` | Living roadmap/ideas (may lag companion detail; trust code + this index) |

---

## Related docs (usually wrong doc for companion)

| Path | Why agents open it by mistake |
|------|-------------------------------|
| `docs/research/ruforge-website-brief.md` | Website/marketing research; sampled competitor **pages**, not server architecture |
| `src/components/island/DYNAMIC-ISLAND-ARCHITECTURE-AND-USABILITY.md` | Main-window Dynamic Island only |
| `README.md` | User-facing product overview; no companion architecture |

---

## Suggested read order for new companion work

1. **`STATE.md`** (what exists today)
2. **`docs/research/companion-architecture-extraction.md`** Part 2 (target design)
3. **`src-tauri/src/companion/`** + **`companion-web/index.html`** (actual behavior)
4. Part 1 or Part 3 of the extraction doc only when designing auth, streaming, or pairing changes
5. **`ruforge-competitive-audit.md`** only if the question is "how do other yt-dlp GUIs compare" (different problem)
