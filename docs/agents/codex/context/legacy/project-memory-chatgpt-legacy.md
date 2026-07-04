> Legacy ChatGPT project memory. Use only as historical context.
> Current RuForge truth is `STATE.md`, root `AGENTS.md`, live code, and the
> routed docs named there. Do not use this file to override current repo docs.

Purpose & context
Angel is the solo developer of RuForge, a free open-source Windows desktop app (Tauri v2 + Rust backend, React 19 + TypeScript frontend, Apache-2.0 licensed) that combines a yt-dlp/ffmpeg-powered downloader with an integrated local media library, video player, mini player, music mode, and a growing feature set including SponsorBlock, MusicBrainz enrichment, scrub previews, Activity Island, and a Discord community bot. The app is distributed at ruforge.app / github.com/UnboundAngel/RuForge.
Claude's established role: architecture and decision-making layer between Angel and Cursor (AI coding agent, nicknamed Chad), plus an audit layer for Chad's output. Jim (Gemini/Google AI Studio) handles visual/styling-only work with no logic or props contract changes. Angel directs; Claude plans, audits, and writes prompts; Chad implements.
Key people and context:

Chad: Cursor agent, all logic/Rust/TypeScript/backend implementation
Jim: Gemini agent, pure visual/styling passes only : never touches logic, state, or props
Sleepy: A discord.py Discord bot for the RuForge community server, separate project under c:\Random things i dont want deleted\Utils\discord_bots\ (private repo UnboundAngel/discord_bots), deployed to Oracle Cloud Always Free VM (129.80.76.181, Ubuntu 22.04)


Current state

RuForge is approaching v0.1.12 release; the public site and Discord community are live
v0.1.12 features include: multi-download carousel, Activity Island (off-tab playback), Windows taskbar transport toolbar, music playlist sidecars, SponsorBlock integration, crash recovery, scrub previews, dev capture tooling, Deno-on-demand for yt-dlp JS runtime, and more
Pre-release legal/privacy documentation pass was completed (PRIVACY.md, LEGAL.md, website copy, README, llms.txt); staged as recon → plan → execute workflow
Roadmap page redesigned to a "Field notes" single-column editorial layout with dot indicators, area chips, and priority gauges; roadmap data workflow documented in .cursor/rules/roadmap-workflow.mdc
Sleepy Discord bot: fully deployed and verified on Oracle Cloud VM; all 7 cogs live (admin, autorole, faq, feedback, placeholder, releases, tickets); slash commands synced; GitHub webhook verified returning 200; SSL currently plain HTTP on bare IP (long-term: bot.ruforge.app + nginx + Let's Encrypt); context consolidated into single SLEEPY.md file

Open/recent:

design-style.mdc context bloat fix: changed from alwaysApply: true to alwaysApply: false (glob handles activation)
Roadmap: shipped entries to be flipped to Finished on v0.1.12 ship (step 8d in release ritual)
Telemetry: Aptabase (usage) + GlitchTip (crash) implemented, gated behind showDebuggingSettings dev flag; consent overlay built; privacy copy written in Angel's voice


On the horizon

v0.1.12 official ship: signed build, version bump across package.json/tauri.conf.json/Cargo.toml, updater.json, GitHub release, roadmap entry flip
Planned but deferred: channel/creator subscriptions with auto-download (identified as biggest unfilled market gap); comments archive sidecar; LAN device-to-device transfer; resumable export
Mobile/TV companion app scoped: phone = transfer/sync model (LAN pull → offline), TV = stream model (direct-play over LAN); QR-code pairing; scoping doc exists (RuForge-companion-scoping.md)
Music features: artist enrichment page (MusicBrainz → Wikidata → Wikipedia, zero-config, no embedded API keys ever); Wrapped-style recap; adaptive recommendation engine (local taste engine, recency-decayed affinity scoring over listen-event log); "Rediscover" shelf powered by profiler output
Feature request voting board for ruforge.app (Featurebase or similar; no GitHub login; embed widget preferred; unlimited free voters)
WinGet Releaser auto-manifest in release ritual


Key learnings & principles
RuForge architecture:

Code present ≠ running on the path : always verify on the actual execution path, not just compilation
npm run build passing does not catch runtime errors (context-provider boundary violations, missing providers, render-path crashes) : runtime render-path verification is required for any hook/provider/context boundary change
Recon-before-fix is non-negotiable: read-only investigation pass first, findings with evidence before any fix prompt
Root cause confirmed with evidence before any fix is written : never fix off inference
One concern per commit, no bundling of unrelated changes; each fix independently bisectable
Chad reads files and checks disk itself : Angel should never run diagnostic steps Chad can do with filesystem access
"code present ≠ running on path" : Chad must verify the actual runtime path, not just that logic exists in a file

Cursor workflow:

Match verification to what Cursor can actually do: self-verify (cheap + deterministic), instrument-for-Angel (runtime/stateful/hardware-dependent), no verification needed (trivial changes)
Don't ask Cursor to re-fetch state already in memory and not stale : trim recon to only genuinely unknown or potentially stale info
Context handoffs to fresh chats: only live session state (what's done, open threads, next action) : never restate anything already in project instructions, AGENTS.md, or STATE.md
Every Chad build/fix prompt must end with explicit instruction to run the build AND verify the app actually runs/renders without runtime errors

Chad output auditing (standing rule):
Every time Angel sends a Chad/Cursor response: (1) Evaluate it : good or needs edits? If needs edits, explain why and write an audit prompt (not a fix prompt); if testable, say so and how. (2) Before generating any prompt for Chad, tell Angel whether to send it in the same chat or a new one, and flag token cost considerations.
Scope and product discipline:

Call Angel out when he's scope creeping
Claude's actual value-add: look up competitors vs. what RuForge currently has; ask follow-up questions to actively refine ideas; don't optimize or business-speak-ify Angel's ideas
Jim handles large visual design passes only; Chad handles small UI placements : strict lane separation
Zero-config, no embedded API keys, ever : RuForge builds for general consumers

Legal/DMCA posture:

Scrubbed telemetry creates no new DMCA exposure as long as URLs, titles, paths, and download history never transmit
DMCA-safe framing in all public copy; no aggressive positioning
EV code-signing is obsolete for SmartScreen; Azure Trusted Signing (~$10/month) is the correct path

Sleepy bot:

Every new Cursor prompt starts with "read SLEEPY_CONTEXT.md first" (fresh-session-only : wastes tokens mid-session)
After any pass adding a new cog, table, command, env var, role rule, or voice pattern : last step must be "update SLEEPY_CONTEXT.md to reflect what changed"
Hard rules: no startup tree.sync(), slash commands only, load_dotenv(override=True) stays forever, no em-dashes ever, no prefix commands, no transcript system
Sleepy's voice: warm/tired character, .. pause beat, no em-dashes, no forced bold, casual openers


Approach & patterns

Staged workflow: recon (🟢 read-only) → plan (🟠) → execute (🔴 instrumentation/fix) → verify; never skip stages on unknown-shape problems
Prompt discipline: prompts to Chad are directive but not over-constraining; explain what seems wrong and ensure Chad understands connected systems, without prescribing how to fix it; short and scope-constrained without limiting creativity; comment-free code by default (agent makes the call)
Session purpose tracking: Claude tracks and follows session purpose through to completion across messages
Context rot detection: if Claude stops naturally using "boss" in replies, that's a signal that niche session instructions may have drifted : used as a soft canary
Research pattern: when Angel says "ask Gemini/Perplexity/anyone" or "tell them X" : always produce a ready-to-paste prompt block, never answer directly
Jim prompts: strictly scoped to styling; hard constraints against touching TS/Rust files, adding state, or causing re-renders; never given tasks with any logic component
Commit discipline: one concern per commit; no entangled changes across independent fixes; staged surgically file-by-file with git status verification; instrumentation stripped before any fix commits


Tools & resources

Stack: Tauri v2, Rust, React 19, TypeScript, Zustand, yt-dlp, ffmpeg, SQLite/aiosqlite (Sleepy), discord.py 2.7.1 (Sleepy)
Coding agents: Cursor (Chad, logic/Rust/TS), Google AI Studio / Gemini CLI (Jim, visuals only)
Research tools: Perplexity, Gemini : Angel runs these externally; Claude provides ready-to-paste prompts
Infrastructure: ruforge.app on Cloudflare Pages (Astro 5 static site); Oracle Cloud Always Free VM for Sleepy; GitHub Actions for CI
Key project files: AGENTS.md (guardrails + release ritual), STATE.md (live cursor, read first / written last by every agent), docs/CHANGELOG-AUTHORING.md, .cursor/rules/roadmap-workflow.mdc, SLEEPY.md (Sleepy's consolidated context doc)
Sleepy IDs: Bot ID 1519089990980866090, dev guild 1519115738038665337, owner ID 1056650574503870474
