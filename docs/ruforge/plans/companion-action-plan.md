# RuForge Companion: action plan and scope control

Canonical scope-control document for RuForge Companion. This is not a brainstorm
and not an architecture audit. It exists to stop future drift (ChatGPT, Cursor,
or a tired maintainer) from re-scoping Companion into a second downloader, a
YouTube surface, or a general remote-access product.

The competitive and architecture research already lives elsewhere and stays
authoritative for how to build the server:

- `docs/ruforge/research/companion-architecture-extraction.md`: the four-project
  extraction (Jellyfin, Navidrome, Snapdrop/PairDrop, go2rtc) and the RuForge
  target design (Part 2). This action plan does not restate it; it locks what
  slice of it V1 is allowed to ship.
- `docs/agents/COMPANION-AND-COMPETITOR-INDEX.md`: routing index for the above
  plus the code map.
- `docs/ruforge/research/ruforge-competitive-audit.md`: yt-dlp GUI product
  audit. Cited only to confirm Companion is not where downloader features go.

Live code wins for current implementation truth. This action plan wins for V1
scope. If current code in `src-tauri/src/companion/` disagrees with a V1
boundary here, do not treat the code as permission to widen V1. Mark the
mismatch as implementation reconciliation needed and fix the code forward only
under a scoped task. Where this plan describes what is in tree today, trust the
code over stale doc text.

Status as of 2026-07-04: Companion is dev-gated behind
`showDebuggingSettings` plus `dev_gate` (`companion/commands.rs`). Nothing here
is in a public release. Browser Companion V1 now binds localhost, opens the
same-PC browser URL, serves the split static client, supports playback, has
progress sync through `POST/GET /progress/:id`, and shows disconnected /
session-lost gates. The `ruforge.local` experiment was dropped; localhost is the
only V1 browser entry point.

Next up: finish small V1 hardening only. Keep it on localhost, keep it
dependency-free, and keep manual app validation as a short Angel checklist
rather than a Cursor testing task.

---

## 1. Product purpose (locked)

RuForge Companion exists to make the existing desktop RuForge library reachable
from a normal web browser first.

- The V1 job it solves: "I am already in my browser and do not want to open the
  desktop app UI." Nothing larger.
- Desktop RuForge stays the forge. It owns the library, the scanner, the
  downloader, and the source of truth. The Rust `library::` module is the single
  authority; Companion resolves everything through `library::resolver` and never
  scans disk or holds its own catalog (`companion/mod.rs` doc comment, and every
  route in `companion/routes.rs` calls the resolver).
- Companion is a consumption and control surface over media that already exists
  in the library. It is not a second downloader and never becomes one.

RuForge is not trying to become Plex. Companion is a thin browser view onto one
user's already-downloaded files, not a media-server product.

---

## 2. V1 scope (locked)

V1 is the same-PC browser Companion and nothing beyond it.

- Same machine only. The browser and desktop RuForge run on the same PC.
- Bind to `127.0.0.1` / localhost only in V1.
- A preferred static localhost port, with an ephemeral fallback if that port is
  occupied.
- The desktop app opens the correct browser URL for the user, so the user never
  has to know or type the port.
- The browser URL for V1 is `http://localhost:<port>`.
- Sections in the browser UI: Videos and Songs only.
- Must support playback of library media in the browser.
- Must sync playback progress back into the existing desktop playback/progress
  path (see Section 3).
- Must show a clear disconnected state: "RuForge is closed or disconnected,"
  plus reconnect behavior when the desktop comes back.
- **V1 expansion (2026-07-04, Angel-approved):** SponsorBlock segment skip,
  scrub preview sprites (where sprite sheets exist), and companion-local
  playback settings (volume, mute, loop, playback speed, SponsorBlock enable).
  All companion-local only; none wired to desktop settings or Zustand.

Everything not in this list is out of V1 by default. See Sections 4 and 5.

Current implementation status:

- Done: same-PC localhost bind and browser open (`http://localhost:<port>`).
- Done: Videos / Songs browser client over the existing library IDs.
- Done: playback, pairing, split static client, favicon, disconnected and
  session-lost states.
- Done: progress sync back into the desktop playback path using media IDs over
  HTTP and internal desktop bridging.
- Next up: confirm whether V1 keeps `8787` as the final V1 default, and do one
  lightweight hardening pass on playback-startup error messaging if needed.
- Done: cached Companion catalog startup. The last Rust-built Companion catalog
  is stored under the app cache and loaded on server start when scan roots still
  match, so large existing libraries can render immediately while the canonical
  reindex refreshes in the background. Companion still uses media IDs over HTTP
  and Rust resolver authority for all path access.
- Done: Music/Songs media-type support. Audio-only library files get browser
  playability projection and stream resolution separate from video/remux rules
  (`library/scanner.rs`, `library/resolver.rs`).
- Done: SponsorBlock segment serving via `/sidecar/:id` (reads or fetches
  `.sponsorblock.json` server-side; segments returned by ID, no path in response).
  companion-web auto-skips and shows skip button; SB enable is companion-local
  (`companion/routes.rs`, `commands/sponsorblock.rs`, `companion-web/app.js`).
- Done: Scrub sprite serving via `/sprite/:id/:idx` (signed URL, HMAC covers
  both media ID and sheet index). `/sidecar/:id` now includes `scrubSpriteCount`.
  companion-web shows hover sprite preview when sheets exist (`companion/routes.rs`,
  `library/resolver.rs`, `companion-web/app.js`).
- Done: Companion-local playback settings: loop, playback speed, SponsorBlock
  enable. All persisted in companion-local `localStorage`; not wired to desktop
  settings (`companion-web/app.js`). Volume/mute was already in tree.
- Done: Custom player controls (replaces native `<video controls>`): play/pause,
  scrub bar with SponsorBlock segment overlays, time display, skip button, speed
  selector, loop toggle, SB toggle, mute, fullscreen (`companion-web/`).
- Next up: confirm whether V1 keeps `8787` as the final V1 default port, and do
  one lightweight hardening pass on session lifetime after restart.

---

## 3. V1 progress sync (locked)

Progress sync is mandatory for public V1. It is the single feature that makes
"watch in the browser" honest rather than a dead-end second screen.

- Progress sync is the only allowed write path in V1. Every other endpoint is
  read-only.
- Writes key off the internal media IDs issued by the desktop/library index
  (the `id` already carried in `/library` items). Companion never sees or writes
  a filesystem path.
- Store position, duration if needed, and a simple playback state. Nothing more.
- Debounce and queue progress in memory on the client, then write through to the
  existing desktop progress path. Do not spam a write per timeupdate.
- Do not create a separate Companion progress store unless the existing
  architecture truly requires it. See the reconciliation note below: today it
  may require a bridge, because the existing store is path-keyed browser
  `localStorage`, not an ID-keyed backend store.
- No arbitrary paths, no metadata edits, no delete/rename/move, no library
  mutation of any kind.

Competitor lesson folded in (from `companion-architecture-extraction.md`
Part 1/2): Jellyfin, Navidrome, and Subsonic-style clients report playback state
through narrow, authenticated, per-item playback-progress writes, not broad
server mutation. Companion copies that shape: a single narrow "set progress for
this media ID" write and nothing that can mutate the library.

Current implementation status:

- Done: `POST /progress/:id` and `GET /progress/:id` use authenticated session
  access and media IDs only.
- Done: Rust resolves the media ID to the trusted desktop path server-side.
- Done: Tauri events bridge writes and reads into `src/playbackStorage.ts`, so
  Companion does not create a separate progress store and never sends paths over
  HTTP.
- Done: client writes are debounced and narrow to position, duration, and simple
  playback state.
- Next up: keep an eye on session lifetime and restart behavior during public
  V1 polish. Do not add any other write path.

---

## 4. Forbidden in V1 and long-term (locked unless Angel explicitly reopens)

None of the following ship in V1, and none are added later without an explicit,
recorded decision by Angel to reopen scope. "Someone asked" or "it would be
cool" is not that decision.

- No downloader UI in Companion.
- No arbitrary URL entry.
- No remote enqueue.
- No endpoint of any kind that can cause RuForge to download from YouTube or any
  external source.
- No output path controls.
- No file uploads.
- No external payload writes.
- No raw filesystem paths in any API response. (Current code already honors
  this: `/library` returns IDs and metadata only; paths are resolved server-side
  in `library::resolver` and never serialized.)
- No desktop library delete, move, or overwrite actions triggered from
  Companion.
- No YouTube surface in V1.
- No bundled ad blocker in V1.
- No LAN binding in V1. Current V1 code binds loopback only.
- No phone, mobile, or TV mode in V1.

---

## 5. Research-gated (not V1, not forbidden, gated on research)

These are allowed to be explored later. They are explicitly not V1 dependencies
and must never be smuggled into V1 as "small additions."

- mDNS/DNS-SD friendly naming. Desired UX target, not a V1 dependency.
  Deferred to V2 with written threat model; requires a new Rust dependency and
  multicast traffic review.
- LAN access beyond localhost. Requires a written threat model first.
- Mobile sync of existing library files only. Never acquisition.
- TV / big-screen mode.
- Browser-to-desktop protocol handler. If it is ever added, it starts
  focus-only, for example `ruforge://focus`. No media IDs, no file paths, no
  commands, no download actions carried by the scheme.
- YouTube viewing-only surface (viewing, never a download trigger).
- Away-from-home access.
- Ad blocker or extension precedent.

Gating something here is a promise it will not appear in a V1 PR. Moving an item
from here into a shipping bucket is a scope decision, made in the roadmap and in
this doc, not in a feature branch.

---

## 6. Roadmap buckets (later)

Ordering only. Each bucket is a separate scope decision; being listed here is not
approval to start.

- V1: same-PC Browser Companion (localhost, Videos and Songs, playback, progress
  sync, disconnected state).
- V1.1: possible focus-only protocol bridge (`ruforge://focus`, focus only).
- V2: LAN access, only after a written threat model.
- V3: mobile sync for existing library files only.
- V4: TV / big-screen mode.

Remux-on-demand for browser-hostile containers (the MKV-with-friendly-codecs
case) is a streaming-quality improvement, not a scope expansion; it is tracked in
`companion-architecture-extraction.md` Part 2.4 and gated separately from these
product buckets. `remux.rs` and the `library-remux` cache dir already exist in
tree (`companion/mod.rs`), so this is partly scaffolded.

---

## 7. Legal and security boundary (locked)

This is the hard line that keeps Companion off DMCA-adjacent ground and out of
store/policy trouble. It does not bend for convenience.

- Companion clients may browse, play, sync progress for, and later (research-
  gated) transfer existing RuForge library files.
- Companion clients must never create, start, queue, schedule, approve, or
  implicitly trigger a download from an external source.
- "Watching causes a download" is forbidden for Companion. There is no path where
  playing or requesting an item in the browser causes RuForge to fetch anything
  from YouTube or elsewhere.
- Explicit desktop approval does not automatically make remote-triggered
  downloading safe. An "approve on desktop" prompt is still remote acquisition
  and stays out of scope.
- The safe line, stated once: the desktop app handles acquisition; Companion
  handles consumption of files that already exist in the library.
- This preserves the legal and store boundary from the prior Companion scoping:
  a mobile or remote Companion is never a YouTube downloader and never a download
  trigger. Follow the framing rules in `AGENTS.md` (no "bypass", "rip",
  "circumvention", etc.) for any Companion-facing copy too.

---

## 8. URL and access strategy (locked)

- `localhost` is canonical for V1. `http://localhost:<port>` is the browser URL.
- Friendly local naming is not a V1 requirement. The same-PC `ruforge.local`
  hosts-file experiment was dropped because the manual setup is not worth the
  product cost. LAN mDNS remains deferred until the V2 threat model.
- Always keep fallback URL behavior: if the preferred port is taken, bind an
  ephemeral port and open that actual URL. The desktop opens whatever port was
  really bound, so the user is never stranded on a stale URL.
- Do not block V1 on friendly local naming. Shipping V1 on a bare localhost URL
  is correct and sufficient.

---

## 9. Existing architecture reconciliation

This compares the V1 direction above against the current Companion
implementation in tree. The rule for this section: do not delete or rewrite
existing decisions here, and do not treat mismatches as bugs to fix on sight.
State what must be mode-gated, deferred, or reused. Mismatches are labeled
"implementation reconciliation needed," which means a future scoped task, not an
immediate edit.

What already matches V1 and should be reused as-is:

- Resolver-only data access. Companion holds no catalog and never scans; it
  resolves through `library::resolver` against the app handle captured at
  `start()` (`companion/mod.rs`, `companion/routes.rs`). Keep this exactly.
- IDs only, no paths, in responses (`/library`, `/sidecar/:id`). Matches
  Section 4. Keep.
- Two-tier auth: HttpOnly `SameSite=Strict` session cookie (`rf_companion`) for
  JSON, plus session-bound HMAC signed short-TTL URLs for media
  (`kind|id|sid|exp`, 300s), verified constant-time (`companion/auth.rs`,
  `companion/routes.rs`). This is the design the research doc endorses. Keep.
- Same-origin guard middleware rejecting cross-origin `Origin`
  (`same_origin_guard` in `routes.rs`). Keep; still correct for loopback.
- QR pairing with a single-use, short-TTL code (`mint_pairing_code`, 120s,
  `used` flag; redeemed in `POST /pair`). Keep the mechanism.
- `playable` / container / codec projection per item, so the browser shows
  "not supported" without a failed fetch. Keep.
- Read-only media serving via `ServeFile` with range/206 and `no-store`. Keep.

What must be mode-gated or reconciled for loopback-first Browser Companion
(implementation reconciliation needed, not an immediate fix):

- Resolved: V1 bind and open URL are localhost-only. LAN bind is deferred to V2
  threat modeling.
- Resolved: same-PC open mints a pairing URL and the browser normalizes to
  `/paired` after session confirmation. QR remains an advanced/manual affordance,
  not a V1 requirement.
- Resolved: progress sync write path exists and bridges media-ID requests into
  the desktop playback store without exposing paths.
- Still open: cookie / session lifetime after desktop restart. Current behavior
  can require re-pairing after restart; decide whether that is acceptable for
  public V1 or should be softened.
- Still open: playback-startup failures should stay inline when the server is
  reachable and the session is valid. Only network/session failures should enter
  disconnected or session-lost gates.
- Resolved: large-library load performance now uses a cached Companion catalog
  loaded from app cache before the background reindex runs. The cache is ignored
  when scan roots changed, and paths remain internal to Rust resolver records.
- Resolved: media-type breadth. Audio-only Music/Songs items use separate browser
  playability and stream resolution from video/remux paths (`library/scanner.rs`,
  `library/resolver.rs`).

Deferred by these buckets, keep in tree but do not surface in V1:
LAN reachability status (`lan_reachable`, `lan_ip` in `CompanionStatus`) and any
device-label / multi-device affordances are for the LAN/mobile buckets. They can
stay in the struct; they just should not drive V1 UI.

Next up: review the remaining LAN-shaped status fields and stale copy after V1
hardening. Do not remove future LAN scaffolding unless it leaks into V1 behavior.

---

## 10. Open questions to preserve

These are unresolved on purpose. Do not invent answers in code; resolve them as
explicit decisions and update this doc.

- Next up: confirm whether V1 keeps `8787` as the default localhost port.
- Resolved: large-library startup uses a root-matched cached Companion catalog,
  then refreshes from the canonical Rust reindex in the background.
- Resolved: Music/Songs browse and playback for already-indexed audio-only files
  via separate browser playability projection from video/remux rules.
- Resolved: progress storage uses the existing desktop `src/playbackStorage.ts`
  path through a Tauri event bridge. Keep media IDs on HTTP and paths internal.
- Resolved for V1: loopback-only binding and localhost open URL are in tree.
  Future LAN mode remains deferred, not deleted.
- Next up: decide whether the current cookie/session model (24h cookie, secret
  rotation on restart) is acceptable for same-PC V1, or whether restart recovery
  should be softened without weakening auth.
- Whether the existing Companion context and research docs
  (`companion-architecture-extraction.md`, `COMPANION-AND-COMPETITOR-INDEX.md`)
  should be updated to point at this action plan, or whether this plan supersedes
  their scope statements. Default assumption: this plan owns scope; those docs
  own architecture and routing.
- **Resolved (2026-07-04):** `ruforge.local` same-PC mechanism dropped. Keep V1
  on localhost. Future LAN naming uses mDNS per RFC 6762/6763 only behind V2
  threat model and a deliberate dependency add (`mdns-sd` or equivalent).
