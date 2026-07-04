# RuForge Companion: action plan and scope control

Canonical scope-control document for RuForge Companion. This is not a brainstorm
and not an architecture audit. It exists to stop future drift (ChatGPT, Cursor,
or a tired maintainer) from re-scoping Companion into a second downloader, a
YouTube surface, or a general remote-access product.

The competitive and architecture research already lives elsewhere and stays
authoritative for how to build the server:

- `docs/research/companion-architecture-extraction.md`: the four-project
  extraction (Jellyfin, Navidrome, Snapdrop/PairDrop, go2rtc) and the RuForge
  target design (Part 2). This action plan does not restate it; it locks what
  slice of it V1 is allowed to ship.
- `docs/COMPANION-AND-COMPETITOR-INDEX.md`: routing index for the above plus the
  code map.
- `docs/research/ruforge-competitive-audit.md`: yt-dlp GUI product audit. Cited
  only to confirm Companion is not where downloader features go.

Live code wins for current implementation truth. This action plan wins for V1
scope. If current code in `src-tauri/src/companion/` disagrees with a V1
boundary here, do not treat the code as permission to widen V1. Mark the
mismatch as implementation reconciliation needed and fix the code forward only
under a scoped task. Where this plan describes what is in tree today, trust the
code over stale doc text.

Status at time of writing: Companion is dev-gated behind `showDebuggingSettings`
plus `dev_gate` (`companion/commands.rs`). Nothing here is in a public release.
Progress sync does not exist in code yet (`/sidecar/:id` returns empty
`chapters`/`subtitles`/`comments`, and there is no write endpoint).

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

Everything not in this list is out of V1 by default. See Sections 4 and 5.

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

Write-path auth is an open reconciliation point, not assumed solved by the
existing read path. The current HttpOnly session cookie and same-origin guard
may be enough for catalog reads and stream-token minting, but the progress write
endpoint must be explicitly reviewed before implementation. That review must
cover at least CSRF exposure, origin policy, and whether the write needs a
stronger token or binding than reads. Do not ship progress sync on reuse of the
read session model alone without that pass.

Reconciliation note (progress store): the existing desktop progress path is
`src/playbackStorage.ts`, which reads and writes browser `localStorage` keys
`ruforge-playback-pos:<videoPath>` and `ruforge-playback-dur:<videoPath>`,
keyed by file path, inside the main WebView. The Companion server is Rust
(`companion/`) and only knows internal IDs, never paths. So a Companion progress
write cannot directly touch today's store. Reconciliation options, to be decided
(open question, Section 10), without changing this section's boundaries:
map ID to path server-side and bridge the write into the main window's existing
`playbackStorage` path via Tauri emit/listen, or introduce a backend
progress store that the desktop reads too. Either way the write stays narrow,
authenticated, and library-read-only.

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
- No LAN binding in V1. (Current code binds `0.0.0.0`; see Section 9,
  implementation reconciliation needed.)
- No phone, mobile, or TV mode in V1.

---

## 5. Research-gated (not V1, not forbidden, gated on research)

These are allowed to be explored later. They are explicitly not V1 dependencies
and must never be smuggled into V1 as "small additions."

- `ruforge.local` / mDNS friendly naming. Desired UX target, not a V1
  dependency.
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
- V1.1: possible focus-only protocol bridge (`ruforge://focus`, focus only) and a
  possible `ruforge.local` experiment.
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
- `ruforge.local` is an aspiration only, and only after mDNS reliability research
  (research-gated, Section 5). It is not a V1 URL.
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

- LAN binding. `CompanionState::start()` binds `0.0.0.0:8787` with an ephemeral
  `0.0.0.0:0` fallback, and `companion_qr_payload` builds a LAN-IP URL
  (`http://{ip}:{port}/?c=...`). V1 requires loopback (`127.0.0.1`) and a
  `http://localhost:<port>` open URL. Reconciliation: gate the bind address and
  the open-URL construction by mode (loopback for Browser Companion V1, LAN only
  behind the future V2 threat-model gate). Do not delete the LAN path; split or
  mode-gate it. Open question in Section 10.
- QR pairing vs same-PC open. On the same machine the desktop can open the
  browser directly and pair without a scanned QR. QR is still the right join
  mechanism for the later LAN/mobile buckets. Reconciliation: decide whether V1
  same-PC uses a direct desktop-opened pairing handoff while QR stays for
  research-gated remote buckets. The underlying single-use code and cookie
  session are reusable either way.
- Cookie / session model for same-PC writes. The cookie (`Max-Age=86400`,
  `SameSite=Strict`, `Path=/`) and `session_secret` rotation on restart /
  `revoke_all` were designed for untrusted LAN browsers. For a loopback same-PC
  browser this may be heavier than needed, and restart-rotation drops the session
  on every desktop restart. Reconciliation: decide whether the session lifetime
  and secret-rotation policy need adjustment for the same-PC write path (progress
  sync). Open question in Section 10.
- Progress sync write path does not exist yet. There is no write endpoint and no
  ID-keyed progress store; the desktop store is path-keyed `localStorage`
  (`src/playbackStorage.ts`). Building V1 progress sync is new work, bounded by
  Section 3. This is the one V1-required capability that is genuinely not in tree.
- Sections limited to Videos and Songs. `/library` already carries `mediaType`
  (`audio` / `video`), so the two-section split is a client filter over existing
  data, not new backend work.

Deferred by these buckets, keep in tree but do not surface in V1:
LAN reachability status (`lan_reachable`, `lan_ip` in `CompanionStatus`) and any
device-label / multi-device affordances are for the LAN/mobile buckets. They can
stay in the struct; they just should not drive V1 UI.

---

## 10. Open questions to preserve

These are unresolved on purpose. Do not invent answers in code; resolve them as
explicit decisions and update this doc.

- Exact static preferred localhost port for V1. Current code uses `8787`
  (`DEFAULT_PORT`), chosen for the LAN design; confirm whether V1 keeps `8787` or
  picks a different loopback default.
- Exact existing progress storage path to reuse. Today it is path-keyed
  `localStorage` in the main WebView (`src/playbackStorage.ts`). Decide whether
  V1 bridges Companion ID writes into that path via Tauri events, or introduces
  an ID-keyed backend store that both the desktop and Companion read. Section 3
  boundaries hold regardless.
- Whether the current LAN Companion code should be split into a separate module
  or mode-gated in place for loopback-only Browser Companion (Section 9 bind /
  open-URL reconciliation).
- Whether the current cookie/session model (24h cookie, secret rotation on
  restart) needs adjustment for same-PC progress writes, or whether same-PC
  should use a lighter session.
- Whether the existing Companion context and research docs
  (`companion-architecture-extraction.md`, `COMPANION-AND-COMPETITOR-INDEX.md`)
  should be updated to point at this action plan, or whether this plan supersedes
  their scope statements. Default assumption: this plan owns scope; those docs
  own architecture and routing.
