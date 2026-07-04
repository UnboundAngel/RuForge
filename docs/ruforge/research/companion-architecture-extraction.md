# Companion Architecture Extraction

Competitive architecture analysis for the RuForge companion LAN server (v1:
browser-only). Source projects: Jellyfin, Navidrome, Snapdrop/PairDrop, go2rtc
(with MediaMTX as a secondary streaming reference). This document feeds and
pressure-tests `.cursor/plans/companion_lan_server_a1f7c239.plan.md`.

Locked v1 scope this analysis assumes: untrusted browsers on the LAN only,
same-origin SPA served by the server, default-deny CORS, session-token cookie
for JSON plus HMAC signed short-TTL URLs for media, QR pairing, HTTP range (206)
of original bytes, no transcode, embedded axum server in the Tauri process.

Citations name real modules and endpoints from each project. They describe the
upstream architecture, not code to copy verbatim.

---

## Part 1: Project sections

### 1. Jellyfin

Full C#/.NET media server plus a separate web SPA. The maximalist reference:
everything RuForge v1 deliberately is not, which makes it the best map of what
to avoid.

#### 1.1 Architecture map

- Server: ASP.NET Core. HTTP surface lives in the `Jellyfin.Api` project as
  controllers: `ItemsController` (catalog/query), `VideosController` and
  `AudioController` and `UniversalAudioController` (media delivery),
  `DynamicHlsController` (HLS transcode segments), `ImageController`
  (thumbnails/posters), `MediaInfoController` (playback info negotiation),
  `UserController`, `QuickConnectController`, `SessionController`.
- Domain and infrastructure: `MediaBrowser.Controller` and `MediaBrowser.Model`
  (interfaces, DTOs), `Emby.Server.Implementations` (concrete services, the
  legacy Emby core), `Jellyfin.Server` (host/composition root). Library scan and
  metadata providers live behind `ILibraryManager` and provider interfaces.
- Persistence: SQLite (`library.db`, `jellyfin.db`) for items, users, devices,
  API keys, playback state.
- Client: `jellyfin-web` is a separate SPA repo, served as static assets by the
  server or hosted independently. Auth is carried as the
  `X-Emby-Authorization` (also `Authorization: MediaBrowser ...`) header on
  fetch calls, and as the `api_key` query parameter on media/image URLs that a
  bare `<video>`/`<img>` cannot add headers to.
- Auth model: username/password against `IAuthenticationProvider`
  (`DefaultAuthenticationProvider`, PBKDF2), producing an AccessToken row bound
  to a device id. `IAuthorizationContext` parses the token from header or query
  on each request. Quick Connect issues a short code the user approves from an
  already-authenticated client, which then hands back a full token.
- Media pipeline: client calls `PlaybackInfo` to negotiate whether the item can
  Direct Play (send original bytes), Direct Stream (remux container), or must
  Transcode (ffmpeg to HLS). Direct Play uses `/Videos/{id}/stream` with
  `static=true` and HTTP range. Transcode uses `/Videos/{id}/master.m3u8` and
  ffmpeg segment output.

#### 1.2 Critical design decisions

- Negotiate first, stream second. `PlaybackInfo` centralizes the direct-vs-remux
  vs-transcode decision using declared client `DeviceProfile` capabilities. This
  is the single most transferable idea: the server decides delivery from client
  capability, it does not assume.
- ffmpeg does the hard part. Container/codec incompatibility is solved by
  shelling to ffmpeg for remux or transcode, so the app code never re-implements
  media muxing.
- Complexity hidden in: DeviceProfiles (huge matrix of client codec support),
  the transcode throttling/segment lifecycle, and DLNA. This is where most
  Jellyfin bug surface lives.
- Deliberately still builds: multi-user accounts, plugins, live TV/DVR, DLNA,
  remote access. All out of RuForge scope.

#### 1.3 Vulnerabilities / weak points

- `api_key` in the query string on stream and image URLs. It lands in server
  logs, browser history, and `Referer`. It is a long-lived bearer credential,
  not a short-TTL signature. This is exactly the anti-pattern RuForge replaces
  with HMAC signed short-TTL URLs.
- Quick Connect is a code-approval flow; if the code space or rate limiting is
  weak it is guessable, and an approval on the wrong device grants a full token.
- Transcoding is the scaling bottleneck: each transcode session is an ffmpeg
  process; concurrent transcodes saturate CPU long before network does.
- Codec/browser limits are pushed onto DeviceProfiles; a wrong profile causes
  either failed playback or needless transcode.
- Server drop mid-transcode orphans ffmpeg segment output and the client stalls
  on the next segment fetch.

#### 1.4 Reusable components

- Endpoint shapes worth mirroring conceptually: an items/library query endpoint,
  a per-item info endpoint, a stream endpoint, an image/thumb endpoint.
- The PlaybackInfo negotiation pattern, reduced to a single boolean for v1: can
  this browser Direct Play this container+codec, yes or no.
- Range handling on the static path (`static=true`) is the correct model for
  RuForge: let the file server do 206. The concrete pattern lives in
  `Jellyfin.Api/Helpers/FileStreamResponseHelpers.cs` (sets `Accept-Ranges`,
  `Content-Range`, relays 200 vs 206); `ProgressiveFileStream` is only needed for
  a file still being written by ffmpeg, so v1 static files skip it.
- Fail-closed auth provider: `InvalidAuthProvider` (`IsEnabled => false`) is the
  stub a user is reassigned to when their real provider is missing, so every
  login throws instead of silently passing. Good pattern to mirror: reject by
  default when auth config is broken.
- Item id as opaque handle (GUID), never a path, in every DTO. The auth token
  scheme name on the wire is literally `Authorization: MediaBrowser Token="..."`.
- Single choke point: `IAuthorizationContext` resolves the token (from header or
  query) once per request. RuForge's equivalent resolves cookie for JSON and
  HMAC sig for media in one middleware.

#### 1.5 The 6 critical evaluations

a. 50 devices: transcode CPU. If even a handful of the 50 need transcode, ffmpeg
   processes saturate the host before the 50 idle metadata clients matter.
b. Unstable WiFi: HLS transcode clients recover reasonably (segment retry), but
   Direct Play range clients see a hard stall and depend on the browser retrying
   the range request. Long transcodes waste CPU on a client that walked away.
c. Auth degrades: the moment a token moves into a query string. Also long-lived
   tokens that never rotate and survive credential change.
d. Assumes trusted clients: DeviceProfiles trust the client's self-declared
   capability list. A lying client changes server behavior.
e. Scale they never reach (for a home): DLNA, clustering-adjacent transcode
   throttling, the full plugin surface.
f. Browser-only, no transcode: Direct Play only. Every item whose container is
   MKV, or codec is HEVC/AC3/DTS, becomes unplayable, because the transcode
   escape hatch is gone. Jellyfin without ffmpeg is a thin static file server,
   which is precisely RuForge v1.

---

### 2. Navidrome

Single Go binary, Subsonic API compatible, embedded React admin UI, SQLite.
The closest structural match to RuForge v1: one process, embedded web assets,
stream files with range, no transcode required on the happy path.

#### 2.1 Architecture map

- Server: Go. Rough package layout: `server/` (HTTP wiring, middleware),
  `server/subsonic/` (the Subsonic REST endpoints), `server/nativeapi/` (the
  React UI's own API), `core/` (business services incl. streaming, artwork,
  transcoding), `model/` (entities), `persistence/` (SQLite via a repository
  layer), `scanner/` (library scan/watch).
- Client: the React admin UI (react-admin based) is built and embedded into the
  binary with Go `embed.FS` and served as static assets. Third-party Subsonic
  apps are also first-class clients over the Subsonic API.
- Auth model, two schemes:
  - Subsonic API: query params `u` (user), `t` (token), `s` (salt) where
    `t = md5(password + salt)`, plus `v`, `c` (client), `f` (format). Legacy
    `p` carries the password directly (often hex/`enc:`). All in the query
    string.
  - Native UI: username/password login returns a JWT; subsequent calls carry
    it. There is also reverse-proxy auth (`ReverseProxyWhitelist` plus a
    user header) for trusted front proxies.
- Media pipeline: `GET /rest/stream` resolves the track, optionally transcodes
  per configured Player/transcoding rules, otherwise serves the original file
  with range support via Go `http.ServeContent`. `GET /rest/getCoverArt` serves
  and caches artwork. Catalog served by `getAlbumList2`, `getArtists`, etc.

#### 2.2 Critical design decisions

- One binary, one file (SQLite), embedded UI. Deploy is copy-and-run. This is
  the model RuForge already targets with an embedded axum server plus embedded
  SPA.
- `http.ServeContent` for streaming. It implements range, `If-Range`,
  `Last-Modified`, ETag, and 206 for free. RuForge's `tower_http` `ServeFile`
  is the direct axum equivalent.
- Scale strategy is vertical and cache-first (artwork cache, in-process),
  not horizontal. They avoid clustering, message queues, external caches.
- Deliberately avoids: video, multi-tenant scaling infra, a heavy account
  system beyond simple users.

#### 2.3 Vulnerabilities / weak points

- The Subsonic auth scheme is weak by spec, and Navidrome inherits it.
  `t = md5(password + salt)` requires the server to hold the recoverable
  password, so Navidrome stores passwords AES-GCM encrypted (not hashed) in
  `persistence/user_repository.go`, keyed by `conf.Server.PasswordEncryptionKey`.
  If that key is unset it falls back to a hardcoded `consts.DefaultEncryptionKey`,
  so out of the box "encrypted" means "obfuscated with a public key." DB
  compromise equals password compromise.
- Reverse-proxy auth (`ExtAuth`, `UsernameFromExtAuthHeader`) trusts a plaintext
  username header when the source IP is in `ExtAuth.TrustedSources`. A docs Docker
  example shows `0.0.0.0/0` there, which lets any reachable host impersonate any
  user including admin via a `Remote-User` header. Sharpest external-auth footgun.
- Credentials/token in the query string: logged, cached, referer-leaked. Same
  class of flaw as Jellyfin `api_key`.
- Salt reuse and offline brute force: `md5(password+salt)` with a captured salt
  is cheap to attack if the password is weak.
- On a LAN with no TLS, the entire Subsonic query string is on the wire in
  clear.
- Streaming bottleneck is disk I/O and, if transcoding is enabled, ffmpeg CPU;
  the happy no-transcode path scales with bandwidth.

#### 2.4 Reusable components

- The single-binary + `embed.FS` static SPA pattern maps one-to-one to
  `rust-embed` in RuForge. Confirms the plan's embed recommendation.
- `http.ServeContent` range semantics as the reference for what
  `ServeFile` must reproduce: 206, `Content-Range`, `Accept-Ranges`, `If-Range`,
  ETag, `Last-Modified`. Confirms the plan's range design.
- Endpoint shapes to mirror: a library list (`getAlbumList2` equivalent), a
  stream endpoint, a cover-art/thumb endpoint with server-side cache.
- Artwork caching model: derive-once, cache-on-disk, serve-many. Good for
  RuForge thumbnails.
- Signed public URLs (the direct precedent for RuForge's media tier). The Shares
  feature (`server/public/public.go`, `core/publicurl`, `CreatePublicToken`)
  issues URLs carrying a signed token so an unauthenticated `<img>`/`<audio>`/
  `<video>` can fetch bytes with no session header. This is exactly the two-tier
  split RuForge plans: cookie gates JSON, signed URL gates the byte stream.
  Navidrome uses a JWT public token; RuForge's raw HMAC is the leaner equivalent.
- `serveStream` pattern: on a seekable file it delegates to `http.ServeContent`;
  the non-seekable branch (live transcode) sets `Accept-Ranges: none`. v1 has no
  transcode so every stream is seekable and the ugly branch never runs.

#### 2.5 The 6 critical evaluations

a. 50 devices: if transcoding is off, SQLite read contention and disk I/O are
   the first pinch, but realistically LAN bandwidth caps first. With transcode
   on, ffmpeg CPU breaks first, same as Jellyfin.
b. Unstable WiFi: range clients stall and rely on the browser re-issuing the
   range request from `currentTime`. No server-side session to lose since each
   request is independent, which is a strength.
c. Auth degrades: it is weak by design. Token in query string, reversible
   password storage, no TLS on LAN. It never had a strong posture to degrade
   from.
d. Assumes trusted clients: the reverse-proxy auth mode trusts a header
   entirely; if the proxy is bypassable, auth is bypassed. Also assumes clients
   keep the token out of shared logs, which query-string auth guarantees they
   will not.
e. Scale they never reach: not much. Navidrome is honest about being a home
   server. Its transcoding-per-player matrix is the main feature most single-LAN
   users never exercise.
f. Browser-only: Navidrome's own React UI is already browser-only and works,
   because audio codecs (mp3/aac/opus/flac in supported containers) mostly Direct
   Play. The lesson transfers to audio cleanly; video is where container/codec
   gates bite.

---

### 3. Snapdrop / PairDrop

Browser-to-browser LAN file transfer. No media ever crosses the server; the
server is a WebSocket signaling broker only. Included for one thing: pairing and
discovery design, and the discovery mistake to not repeat.

#### 3.1 Architecture map

- Server: Node.js. Snapdrop is a small WebSocket signaling server (`index.js` /
  `server/` with the `ws` library). It brokers SDP/ICE between peers and never
  handles file bytes. PairDrop is a maintained fork with the same core plus
  explicit pairing.
- Discovery model (Snapdrop): peers are auto-grouped into a room by their
  observed public IP. Everyone behind the same NAT sees each other
  automatically. Peer identity is a server-assigned id with a derived display
  name (deterministic animal/name from a hash), no login.
- Pairing model (PairDrop): adds deliberate pairing beyond same-network
  auto-discovery. "Pair Devices" issues a 6-digit temporary code (short TTL,
  server-brokered) that another device enters to form a persistent pairing
  stored client-side (localStorage room secrets). Also public room codes for
  ad-hoc groups. Persistent pairings survive across networks; temporary codes
  expire.
- Data flow: after signaling, `RTCPeerConnection` carries the transfer directly
  (DataChannel), with STUN for NAT traversal. If WebRTC fails, Snapdrop/PairDrop
  can fall back to routing the transfer through the WebSocket server.
- Client: PWA with a service worker (offline shell, installable). Heartbeat via
  WS ping/pong to detect dead peers.

#### 3.2 Critical design decisions

- Server stays tiny because it never touches file bytes. All heavy data is P2P.
  Complexity is pushed into the browser (WebRTC) and into STUN/TURN for NAT.
- Zero accounts. Identity is ephemeral per connection; pairing (PairDrop) is the
  only durable state and it lives on the client.
- Deliberately avoids: storage, transcode, any media handling, any user db.

#### 3.3 Vulnerabilities / weak points

- The signature flaw: "same public IP = same room" auto-discovery. On shared
  networks (dorms, offices, carrier-grade NAT, public WiFi) strangers land in
  the same room and see each other. This is a privacy footgun to explicitly not
  copy. RuForge must never auto-enroll a device just because it shares the LAN.
- 6-digit codes are brute-forceable without strict rate limiting and short TTL.
  Entropy is low (10^6); the mitigation is single-use plus expiry plus
  server-side attempt limiting, not code length.
- No real authentication of peers; trust is "we are on the same network," which
  is exactly the assumption RuForge rejects for untrusted LAN browsers.
- `X-Forwarded-For` trust: behind a proxy the room is derived from that header,
  so a client that can spoof it picks its room. That is a room-hijack primitive.
  Lesson for RuForge: never derive trust from a client-settable header.
- The optional WS relay fallback (`WS_FALLBACK`) routes file bytes through the
  server base64-encoded and is server-readable, silently downgrading the E2E
  assumption. RuForge streams from the desktop by design, so it must never add a
  path that quietly changes the trust/confidentiality model.
- Reconnect: on server drop the WS signaling dies, in-flight WebRTC transfers
  may continue (already P2P) but no new peers can be discovered; clients retry
  the WS connection with backoff.
- WebRTC browser compat and corporate-firewall/TURN needs add operational
  fragility that a pure HTTP design avoids.

#### 3.4 Reusable components

- Pairing code design to borrow (verified symbols): `_onPairDeviceInitiate`
  mints `roomSecret = randomizer.getRandomString(256)` plus a short human code
  `pairKey` via `_createPairKey`, which loops
  `crypto.randomInt(1000000, 1999999).toString().substring(1)` to get a
  fixed-length 6-digit code with no leading-zero loss and no modulo bias. On
  redemption (`_onPairDeviceJoin`) the server hands back the long secret and
  immediately calls `_removePairKey`. The short code is single-use and ephemeral;
  the long secret is the durable credential. RuForge's QR delivers the code
  visually instead of typed, so use a long random code directly (entropy is free
  when nobody types it) and still invalidate it the instant it is redeemed.
- Rate limiting to borrow: `rateLimitReached()` returns a typed
  `join-key-rate-limit`, gated by a `RATE_LIMIT` env (1000 req / 5 min). For a
  brute-forceable numeric code that is too coarse; RuForge wants per-code attempt
  lockout plus short TTL, since the code is the whole gate.
- Input shape validation to borrow: `_onRoomSecrets` filters incoming secrets
  against `/^[\x00-\x7F]{64,256}$/` before trusting them. Validate the shape of
  anything a browser hands back before using it as a credential key.
- QR/room join flow: open a URL that carries the code, client immediately
  redeems it for durable credentials. Matches the plan's
  `/?c=<code>` then `POST /pair`.
- Heartbeat / liveness (WS ping/pong) as the model for a "paired devices with
  last-seen" view, though RuForge's stateless HTTP uses last-request time, not a
  socket.
- Deterministic friendly device naming from an id, so the desktop can label
  paired devices without asking the user to type a name.

#### 3.5 The 6 critical evaluations

a. 50 devices: signaling server fan-out. Every peer join broadcasts to the room;
   an N-peer room is O(N^2) signaling chatter. For RuForge this is moot because
   there is no room broadcast; devices only talk to the desktop.
b. Unstable WiFi: WS signaling drops and reconnects with backoff; active P2P
   transfers survive since they do not need the server. Lesson: keep the control
   channel cheap to re-establish.
c. Auth degrades: it starts insecure (network-presence trust) and PairDrop only
   partially fixes it with explicit pairing. Auto-discovery is the permanent
   weak spot.
d. Assumes trusted clients: everything. Same-network presence is treated as
   authorization to appear and connect.
e. Scale they never reach: public-room infrastructure and TURN relay capacity
   for internet-wide use, irrelevant to a single home LAN.
f. Browser-only: they are already browser-only, so the lesson is inverted. It
   proves a browser-only client can pair via short code and QR with zero native
   install, which validates RuForge's approach. What it does not solve is media
   delivery, since RuForge streams bytes from the desktop rather than P2P.

---

### 4. go2rtc (primary), MediaMTX (secondary)

Single-binary Go streaming servers. Built for live camera feeds, not stored
files, but they are the best reference for the browser delivery ladder and for
the container/codec reality that dictates RuForge's range-vs-fallback decision.

#### 4.1 Architecture map

- go2rtc: single binary, one YAML config (`go2rtc.yaml`) with a `streams:` map
  of named sources. Internal modules by protocol: `api` (HTTP + embedded web
  UI), `streams` (source registry, codec probe), `webrtc`, `mse`, `hls`,
  `mp4`, `rtsp`. It ingests a source once and fans out to multiple output
  protocols, transcoding via ffmpeg only when a consumer cannot accept the
  source codec.
- Client delivery ladder (go2rtc web player): try WebRTC first (lowest latency,
  widest codec support incl. H.265 in some paths), fall back to MSE (fragmented
  MP4 over WebSocket, Media Source Extensions), fall back to MP4/HLS
  progressive. The player probes what the browser can decode and picks the
  highest rung that works.
- MediaMTX: multi-protocol server (`paths` config), ingest via RTSP/RTMP/SRT,
  publish via HLS (its own muxer, LL-HLS capable), WebRTC (WHEP), RTSP. Distinct
  insight: a mature HLS muxer as the universal-compat fallback when WebRTC/MSE
  are unavailable.
- Auth: minimal by default. go2rtc supports an optional
  `api: { username, password }` and origin controls, but the default posture is
  open on the LAN. MediaMTX similarly ships permissive and expects the operator
  to lock it down.

#### 4.2 Critical design decisions

- Ingest once, fan out to many outputs. Complexity is concentrated in codec
  probing and the protocol adapters. For stored-file RuForge this is overkill:
  there is one consumer per request and the source is a finished file.
- The fallback ladder exists because no single browser delivery method plays
  every codec. WebRTC handles some codecs MSE cannot and vice versa; HLS/MP4 is
  the lowest-common-denominator floor.
- Single binary + embedded web UI + one config file, same simplicity thesis as
  Navidrome. Confirms RuForge's embed choice again.
- Deliberately avoids: user accounts, libraries, persistence. It is a pipe, not
  a catalog.

#### 4.3 Vulnerabilities / weak points

- Auth is the weak point by default: open on the LAN, credentials (if set) are
  basic, and the whole design assumes a trusted network. Do not inherit this.
- API as RCE: go2rtc `exec` and `echo` stream sources run arbitrary commands, and
  the API is reachable from any LAN browser unless `modules`/`api.allow_paths`
  are locked down. The README flags this as full server compromise. This is the
  sharpest "assumes trusted client" failure across all four projects. RuForge must
  expose zero command-executing or config-mutating endpoint to clients.
- Multi-port exposure: protecting `api.listen` (1984) does nothing for the RTSP
  (8554) and WebRTC (8555) ports still bound directly. Lesson: one listener,
  nothing else bound.
- Transcode CPU is the hard ceiling: any consumer needing a codec the source
  lacks spawns ffmpeg. Concurrent transcodes are the first thing to fall over.
- WebRTC/MSE add reconnection and browser-quirk fragility. HLS is the robust but
  higher-latency floor.
- Live-first assumptions (latency, continuous ingest) do not map to seekable
  stored files; their strengths are partly wasted on RuForge's use case.

#### 4.4 Reusable components

- The delivery-ladder decision logic, reduced for stored files: decide per item
  whether the browser can Direct Play the container+codec; if yes, plain HTTP
  range; if no, the only honest options are remux (stream-copy to fMP4, cheap)
  or transcode (expensive, out of v1 scope).
- Codec/container probing at catalog time (ffprobe) so the library response can
  carry a `playable` flag per item and the client never guesses.
- Single-binary + embedded UI pattern, reconfirmed.

#### 4.5 The 6 critical evaluations

a. 50 devices: concurrent transcode/CPU. Passthrough streams scale with
   bandwidth; the moment codecs mismatch, ffmpeg count breaks it.
b. Unstable WiFi: WebRTC and MSE need reconnection logic and can stall; HLS
   tolerates jitter best via segment buffering. For plain range, the browser
   retries the range request.
c. Auth degrades: it is effectively off by default. Silent insecurity is the
   baseline, not a degradation.
d. Assumes trusted clients: the entire default config. Open LAN listener, no per
   client auth.
e. Scale they never reach (for stored home files): multi-protocol ingest,
   live-latency tuning, WHEP/WHIP, RTSP restreaming.
f. Browser-only: this is their core target, and it is exactly why the ladder
   exists. It proves the point RuForge must internalize: browser-only means the
   container/codec gate is the whole game.

#### 4.6 Codec/container decision (the crisp recommendation)

Container is the first gate, codec is the second. Browsers do not play the
Matroska (`.mkv`) container natively at all, regardless of the codecs inside.

- Direct HTTP range (206) of the original file is enough when:
  - MP4/MOV container with H.264 (AVC) video + AAC audio. Universal.
  - WebM container with VP8/VP9/AV1 video + Opus/Vorbis audio. Universal on
    Chromium, good on Firefox.
  - MP4 with AV1 + AAC/Opus on recent Chromium.
- Direct range fails or is unreliable, so a fallback (remux or transcode) is
  required, when:
  - Any MKV container. Very common yt-dlp output when merging incompatible
    streams. Codecs may be fine, container is not. This is RuForge's most likely
    real failure and the plan underweights it.
  - HEVC/H.265 in MP4: no on Chrome/Firefox desktop by default, sometimes yes on
    Safari and some hardware. Treat as not-playable in v1.
  - Audio codecs AC-3, E-AC-3, DTS, TrueHD: unsupported in browsers.
  - Opus/FLAC inside MKV: fails because the container fails, even though the
    codec would play in WebM.
  - AVI, FLV, MPEG-TS, `.ts`: no.
- The cheap fix that is not transcoding: remux by stream-copy into fMP4/MP4
  (ffmpeg `-c copy`) when the codecs are browser-friendly but the container is
  not (the MKV-with-H.264 case). No re-encode, low CPU. v1 says no transcode;
  remux is a distinct, cheaper category and should be considered rather than
  lumped into "transcode later."
- Seeking nuance even on a direct-playable MP4: if the `moov` atom is at the end
  of the file (not faststart), the browser must fetch the tail before seeks work
  well. A one-time `ffmpeg -c copy -movflags +faststart` remux fixes seeking with
  no re-encode. Worth a catalog-time check for MP4s RuForge did not produce.
- go2rtc's own division of labor is the rule to copy: keep only trivial
  repackaging in-process, shell everything heavy to ffmpeg, and only when a codec
  truly does not match. It explicitly refuses to embed a transcoder.

---

## Part 2: RuForge Companion Architecture Template

Synthesis across all four projects into one target design for the browser-only
LAN v1.

### 2.1 Canonical endpoint structure

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/` | none | Companion SPA. Reads `?c=<code>`. |
| GET | `/healthz` | none | Liveness for desktop status checks. |
| POST | `/pair` | pairing code | Redeem single-use code, set session cookie. |
| GET | `/library` | session | Catalog metadata, `playable` flag per item, ids only, no paths. |
| GET | `/sidecar/:id` | session | Chapters, subtitle meta, comments for one id. |
| GET | `/stream-token/:id` | session | Mint a fresh signed stream URL on demand. |
| GET | `/stream/:id?exp&sig` | signed URL | Range-capable (206) media stream. |
| GET | `/thumb/:id?exp&sig` | signed URL | Signed, server-cached thumbnail. |
| DELETE | `/session` (or `POST /logout`) | session | Client-initiated unpair. |

Notes: mint signed URLs lazily via `/stream-token/:id` rather than pre-signing
every item in `/library` (see Reconciliation). `/library` carries a per-item
`playable: bool` derived from a catalog-time ffprobe of container+codec, so the
client shows "not supported" without a failed fetch.

### 2.2 Auth model (QR to session token to device lifecycle)

1. Pairing code: the desktop mints a high-entropy random code (128-bit,
   base64url), TTL about 2 minutes, single use, held server-side with an attempt
   counter. The QR encodes `http://<ip>:<port>/?c=<code>`. Because the user
   scans rather than types, code length is free entropy; do not use a short
   human-typed code (the PairDrop 6-digit model is only for typed entry).
2. Redeem: SPA `POST /pair {code}`. Server validates (exists, not expired, not
   used, attempts under limit), marks used, creates a session.
3. Session token: 256-bit opaque random, stored server-side with created,
   last-seen, and a device label. Delivered as an `HttpOnly`, `SameSite=Strict`,
   `Path=/` cookie only. Do not also return it in the JSON body (keeps it out of
   JS, limits XSS token theft).
4. Signed media URL: `sig = HMAC_SHA256(session_secret, "stream|<id>|<exp>|<session_id>")`.
   Binding the session id into the HMAC message means a leaked URL cannot be
   replayed by a different session, and revoking one session invalidates its
   URLs without rotating the global secret. Short TTL (5 min).
5. Device lifecycle: "paired devices" view reads the session map (label,
   last-seen). Per-device revoke deletes that session. "Revoke all" rotates
   `session_secret`, killing every token and signed URL. App restart rotates
   `session_secret` by generating a new one.

### 2.3 CORS + origin policy

- Default deny. Same-origin SPA means the happy path uses no CORS headers.
- Never `Access-Control-Allow-Origin: *`. A dev-only allowlist (echo the exact
  Vite origin) gated behind a debug flag is the only exception.
- Reject any request whose `Origin` header is present and not equal to the
  server origin. Blocks a malicious LAN page from driving the API through the
  user's browser.
- Only `POST /pair` and `DELETE /session` are state-changing; `SameSite=Strict`
  plus same-origin checks cover CSRF. No state-changing GET.

### 2.4 Streaming model (range vs fallback decision rules)

- Default and v1 path: plain HTTP range (206) via `tower_http` `ServeFile`,
  serving original bytes. This is correct and sufficient for MP4(H.264/AAC) and
  WebM(VP9/Opus), which cover the bulk of yt-dlp output.
- Decision at catalog time, not playback time: ffprobe each item once, store
  `container`, `vcodec`, `acodec`, and compute `playable`. Rules:
  - MP4/MOV + H.264 + AAC: playable, direct range.
  - WebM + VP8/VP9/AV1 + Opus/Vorbis: playable, direct range.
  - MKV (any): not directly playable (container). Candidate for remux.
  - HEVC, AC-3/E-AC-3/DTS/TrueHD, AVI/FLV/TS: not playable in v1.
  - MP4 with `moov` at the end (no faststart): plays but seeks poorly until the
    browser fetches the tail. Flag it; a one-time `-c copy -movflags +faststart`
    remux fixes seeking without re-encode.
- Fallback ladder, explicit:
  - v1: no fallback. Non-playable items surface "format not supported by
    browser" client-side. Honest, matches locked scope.
  - v1.1 recommended next rung: remux-on-demand by stream-copy to fMP4
    (`ffmpeg -c copy`) for the MKV-with-friendly-codecs case. Cheap, no
    re-encode, fixes the single most common failure.
  - Later: HLS/fMP4 via full transcode for HEVC/AC-3/etc. Out of scope now.
- Do not adopt WebRTC or MSE. They exist in go2rtc for live low-latency and
  multi-codec live feeds. For seekable stored files, HTTP range is simpler,
  seek-native, and cache-friendly.

### 2.5 Pairing / discovery system design

- QR pairing is the join mechanism. Confirmed sufficient by PairDrop (short code
  redeem) and by the fact that RuForge already shows the desktop UI where the QR
  lives.
- Recommendation: no LAN discovery (no mDNS/`_ruforge._tcp`) in v1. Reasons:
  - QR fully covers device join without exposing a discoverable service.
  - Snapdrop's auto-discovery ("same network = visible") is a privacy footgun on
    shared networks and directly contradicts the untrusted-LAN posture.
  - A discoverable listener widens attack surface for zero v1 benefit.
- If discovery is ever added, it must advertise presence only, never auto-enroll;
  a device still redeems a QR/code to gain any credential.

### 2.6 Failure recovery rules

- Expired pairing code: `POST /pair` -> 401. Desktop offers "regenerate QR."
- Expired session token: metadata endpoints -> 401. SPA shows "rejoin, rescan
  QR." Optionally the cookie is rolling (see state model) to avoid mid-session
  eviction.
- Expired signed stream URL mid-playback: next range request -> 403. SPA calls
  `/stream-token/:id`, swaps `<video src>`, restores `currentTime`. No full
  reload. This is the key resilience move, borrowed conceptually from the
  negotiate-then-stream split.
- Unstable WiFi: every request is independent (no server-side playback socket),
  so recovery is a browser range retry. This statelessness is a strength taken
  from Navidrome and reinforced by Snapdrop's cheap-control-channel lesson.
- Device disconnect: no persistent socket to lose. Session goes idle; last-seen
  reflects it. Desktop can revoke.
- App restart: `session_secret` rotates, all tokens and signed URLs die,
  paired devices must rescan. Conscious tradeoff (see Reconciliation): a TV
  mid-movie loses playback on every desktop restart.
- Port conflict: scan from a default port, persist the chosen one, ensure the QR
  reflects the actual bound port.
- Bind failure / firewall denial: fall back to loopback-only, surface a desktop
  state explaining the firewall allowance. Never crash, never retry-loop.

### 2.7 Security boundaries (what clients can NEVER access)

- No filesystem paths in any response. Ids only, resolved server-side.
- No raw-path endpoint, no directory listing, no enumeration beyond the
  whitelisted catalog.
- Every media request re-canonicalizes the resolved path and asserts it is under
  an `allowed_root` (canonicalize defeats symlink escape).
- No transcode/exec surface reachable by clients in v1.
- No credential ever in a query string except the HMAC signature, which is
  short-TTL, session-bound, and not a reusable password (the explicit fix for
  the Jellyfin `api_key` and Navidrome `t`/`p` anti-patterns).
- No internet exposure, port forwarding, or UPnP. LAN only, always.

### 2.8 Performance model (cached vs streamed live)

- Streamed live per request: media bytes via `ServeFile` range. Never buffered
  whole, never cached in the server; the OS page cache handles hot files.
- Cached (derive once, serve many): thumbnails and the ffprobe-derived catalog
  metadata (`container`/`codec`/`playable`). Artwork cache pattern taken from
  Navidrome `getCoverArt`.
- Cheap and per-request: HMAC verify (constant-time), session map lookup.
- The real ceiling in a no-transcode design is LAN bandwidth and disk I/O, not
  CPU. This is the deliberate win of skipping transcode: 50 idle browsers cost
  almost nothing; concurrent streams cost bandwidth, not cores.

### 2.9 State model (server-owned vs client-owned)

- Server-owned (authoritative, in-memory, dies on restart): `session_secret`,
  pairing codes, session map (token, created, last-seen, label), the catalog
  (id to canonical path + meta + playable), allowed roots.
- Client-owned: the session cookie (HttpOnly, so JS cannot read it, only send
  it), current playback position (browser `<video>` state), and any UI
  preferences in the SPA.
- No shared mutable state between devices. Each browser is an independent,
  stateless-per-request consumer. This avoids the state-sync class of bugs
  entirely, which is the correct posture for untrusted clients.

### 2.10 Reconciliation with existing plan

Compared against `.cursor/plans/companion_lan_server_a1f7c239.plan.md`.

Confirmations (the plan is right):
- Same-origin SPA served by the server as the CORS-killer. Correct, matches
  Navidrome/go2rtc embedded-UI practice.
- HTTP range via `tower_http` `ServeFile` for 206. Correct, direct equivalent of
  Navidrome `http.ServeContent`.
- Two-tier auth (cookie for JSON, HMAC signed URL for media). Correct, and
  strictly better than every studied project's query-string bearer token.
- `session_secret` rotation on restart / revoke-all. Sound.
- No mDNS discovery in v1. Confirmed by the Snapdrop auto-discovery footgun.
- Embed the SPA in the binary. Confirmed twice (Navidrome, go2rtc).
- Path canonicalization + allowed-root prefix check. Correct and necessary.

Corrections (change the plan):
1. Container gate, not just codec. The plan's "Codec limitation" says Chromium
   plays mp4 and webm and treats the gap as codec-only. The dominant real
   failure is the MKV container, which browsers never play regardless of internal
   codec, and which yt-dlp emits often. Add container to the gate, probe it at
   catalog time, and expose a per-item `playable` flag. Strongly consider a
   remux-by-stream-copy path (not transcode) as the first fallback, since it
   fixes MKV-with-friendly-codecs cheaply.
2. Signed URL must be session-bound and minted lazily. The plan mints pre-signed
   URLs for the whole library in `/library` and HMACs `stream|<id>|<exp>`. That
   emits many live bearer URLs at once and any leaked URL is replayable by anyone
   within the TTL. Bind the session id into the HMAC message
   (`stream|<id>|<exp>|<session_id>`) and mint on demand via `/stream-token/:id`.
   This also lets per-session revoke invalidate URLs without a global rotation.
3. Do not also return the session token in the `/pair` body. The plan returns it
   in both the cookie and the body "for explicit header use." The body copy is
   readable by JS and defeats the HttpOnly protection under XSS. Cookie-only is
   safer and the same-origin SPA never needs the header form.

New risks the plan missed:
- Pairing-code brute force is unaddressed. The plan sets TTL and single-use but
  not entropy or server-side attempt limiting. Use a long random code (QR makes
  length free) plus an attempt counter. The Snapdrop/PairDrop lesson: short
  codes without rate limiting are guessable.
- Restart-kills-playback UX. Rotating `session_secret` on every app restart
  drops a TV mid-movie and forces a rescan. Acceptable for security, but call it
  out and consider an opt-in persisted secret for "trusted home" mode later.
- No connection/rate cap. 50 devices is fine for metadata, but there is no
  stated cap on concurrent streams or request rate; add a simple concurrency and
  per-IP rate limit to avoid a single client saturating disk/bandwidth.
- `playable` requires ffprobe at scan time. This adds a dependency on the
  existing gallery scan pipeline producing codec/container metadata. If it does
  not today, that is new work the plan does not account for.

---

## Part 3: Code Extraction Map

Patterns worth borrowing, what each contributes, and what to leave behind.

### 3.1 Borrow these patterns

| Project | Module / area | Contributes |
|---------|---------------|-------------|
| Navidrome | `embed.FS` static UI in the single binary | Embedded SPA pattern (RuForge: `rust-embed`). Versioning the client with the app. |
| Navidrome | `http.ServeContent` in the stream handler | Reference range/206/`If-Range`/ETag semantics `ServeFile` must match. |
| Navidrome | `getCoverArt` artwork cache | Derive-once, cache-on-disk, serve-many thumbnail model. |
| Navidrome | Subsonic endpoint shapes (`getAlbumList2`, `stream`) | Catalog-list + stream + thumb endpoint separation. |
| Navidrome | Shares signed URLs (`server/public/public.go`, `core/publicurl`, `CreatePublicToken`) | Direct precedent for the HMAC media tier: a signed URL a headerless `<video>`/`<img>` can fetch. The strongest single validation of the plan's design. |
| Navidrome | `serveStream` seekable-vs-not branch | Confirms: no-transcode means every stream is seekable, so only the clean `ServeContent` path is needed. |
| Jellyfin | `Jellyfin.Api/Helpers/FileStreamResponseHelpers.cs` | Concrete 200-vs-206 / `Content-Range` / `Accept-Ranges` handling to reproduce in `ServeFile`. |
| Jellyfin | `InvalidAuthProvider` fail-closed stub | Reject-by-default when auth config is broken, instead of silent pass-through. |
| Jellyfin | `PlaybackInfo` / DeviceProfile negotiation | Negotiate-then-stream idea, collapsed to a single `playable` boolean per item. |
| Jellyfin | `IAuthorizationContext` token parsing | Single choke point that resolves auth per request (adapt to cookie + HMAC). |
| Jellyfin | `static=true` direct-play path | Confirms the "serve original bytes with range" happy path. |
| PairDrop | `_createPairKey` / `roomSecret` split, `_removePairKey` on redeem | QR `/?c=` then `POST /pair`: short single-use code redeems to a long durable session, code killed the instant it is used. |
| PairDrop | `_onRoomSecrets` shape validation (`/^[\x00-\x7F]{64,256}$/`) | Validate the shape of any client-supplied credential before trusting it. |
| PairDrop | Persistent-pairing vs temporary-code split | Session (durable) vs pairing code (ephemeral) separation. |
| Snapdrop/PairDrop | Deterministic friendly device naming | Label paired devices without user typing. |
| Snapdrop/PairDrop | WS ping/pong liveness | Model for last-seen in the paired-devices view (via last-request time, not a socket). |
| go2rtc | Delivery-ladder decision (`streams` codec probe) | Per-item playable decision; when direct works vs when remux/transcode is required. |
| go2rtc | Single binary + one config + embedded web UI | Reconfirms the minimal-surface, embedded posture. |
| MediaMTX | HLS muxer as universal-compat floor | Reference only, for the eventual transcode fallback rung, not v1. |

### 3.2 What NOT to copy

- Jellyfin: multi-user accounts, plugin framework, DLNA, live TV/DVR, the full
  DeviceProfile matrix, transcoding farm and segment lifecycle, remote access.
  All are scale and generality RuForge v1 will never reach.
- Jellyfin/Navidrome: any credential in the query string (`api_key`, Subsonic
  `t`/`s`/`p`). This is the exact anti-pattern the HMAC signed-URL design
  replaces. Do not reintroduce it.
- Navidrome: reversible password storage and the whole Subsonic salt/token
  scheme (it exists only for third-party Subsonic client compat, which RuForge
  has no reason to support). Also reverse-proxy header trust.
- Snapdrop/PairDrop: same-public-IP auto-discovery (privacy footgun), WebRTC/
  DataChannel/STUN/TURN stack (RuForge streams from the desktop, not P2P), and
  short human-typed codes without rate limiting.
- go2rtc/MediaMTX: WebRTC/MSE/WHEP/RTSP multi-protocol ingest and live-latency
  tuning (built for cameras, wasted on seekable stored files), and their
  open-by-default auth posture. Above all, never expose anything like go2rtc's
  `exec`/`echo` sources: a client-reachable command-executing endpoint is RCE.
- General: clustering, external cache/queue, message brokers, any horizontal
  scale infra. The single embedded process is the right and sufficient model.
