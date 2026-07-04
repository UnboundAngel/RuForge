> Codex audit reference imported from ChatGPT project context.
> Use after reading `STATE.md`, root `AGENTS.md`, and any routed repo docs.
> If this file conflicts with repo truth, repo truth wins.

# AUDIT REFERENCE : depth the instructions can't hold

Pull this when a task touches an external tool, a third-party API, a version or
default, a platform limit, or a store/legal line. This is the trap depth. Name
the specific trap in one line or you have not audited it.

## PROJECT-TRUTH OVERRIDE (your worst failure)
When your general/web knowledge conflicts with a RuForge file (STATE.md,
AGENTS.md, BLUEPRINT.md, SLEEPY.md, scoping docs), THE FILE WINS. Say it:
"Project truth overrides my default : AGENTS.md says X."
Load-bearing example that already bit: localStorage does NOT span the two
webviews here, and neither does Zustand. Cross-window sync is Tauri emit/listen
ONLY. The textbook answer ("localStorage is shared across windows") is WRONG in
this setup. Keep sources distinct: "the doc says" (given) vs "Microsoft's page
says" (searchable, drop a notch until you've searched).

## TRAP CATALOG (miss one = no passing grade, no matter how clean the build)
- **Legal/store:** auto-download, channel monitoring, mobile companion, or any
  hosted endpoint hitting YouTube. Apple Guideline 5.2.3 bans downloading from
  third-party sources like YouTube; a player on the user's OWN local files is
  allowed, a phone app that TRIGGERS a download is banned. DMCA Section 1201:
  RuForge's moat is "user runs it locally on their own files." The moment
  ruforge.app itself hits YouTube and parses formats, RuForge is the operator
  and the moat is gone. Fake the forge on marketing surfaces, never run it.
- **Stale-info:** premise on an expired fact. EV cert "fixing" SmartScreen is
  DEAD; Azure Trusted Signing ~$10/mo is the path and does NOT guarantee a
  clean first install. "It's been working" is not verification : it worked
  before the version bumped.
- **Changed default (worst, fails silently):** a default flipped, code still
  compiles, breaks at runtime for some users later. Check the exact bundled
  version's changelog before building on a tool's default behavior.
- **Architecture smell:** races, no write ownership, polling where events
  belong, firing off a signal before the artifact it needs is on disk.
- **Platform edge case:** iOS has no always-on background daemon (no reliable
  overnight full-library sync), sandbox storage rules, webview isolation, and
  what a serverless runtime physically can't run (no binaries/subprocess/ffmpeg/
  yt-dlp inside a Cloudflare Worker).
- **Bad-ROI premise:** wrong audience/risk class. RuForge's users are yt-dlp
  and 4K Downloader refugees, r/DataHoarder, r/selfhosted, r/rust : not Product
  Hunt tourists. Google Ads on "youtube downloader" is DMCA-adjacent. Sanctioned
  stack: AlternativeTo, awesome-tauri/awesome-yt-dlp PRs, WinGet Releaser,
  tailored Reddit, yt-dlp wiki Frontends PR.

## THIRD-PARTY LIMITS THAT BITE
- **MusicBrainz:** 1 req/sec per IP (hard, IP-block on violation), descriptive
  User-Agent required, and they explicitly ask apps NOT to wake at a fixed time
  to batch-query (3AM is their named bad example). Idle/on-launch triggered,
  >=1100ms gate, resumable checkpoint, 503 backoff. Not a fast nightly loop.
- **yt-dlp:** moves on YouTube's schedule. Downloader args, external-downloader
  support, and format behavior are version-volatile. Check the bundled
  version's changelog before building on any flag.

## RUFORGE NORTH STAR
The wedge is the DOWNLOADER: reliable YouTube + local handling, persistence,
performance. Player, gallery, music, polish SUPPORT that : not the edge. Don't
chase "compete with Plex/VLC" pivots unless Angel widens scope. Ground every
rec in what RuForge already is.
