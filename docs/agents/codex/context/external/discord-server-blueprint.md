> External project context for RuForge Discord community planning.
> Not a RuForge app source of truth. Use only when the task explicitly touches
> Discord community planning or Sleepy-related context.

# RuForge Discord : Server Blueprint

Local-first OSS desktop app. Server doubles as support desk, release feed, and feature-request funnel.
Positioning rule carries over from the website: lead with "open-source media library / yt-dlp GUI," never "YouTube downloader." Same DMCA exposure applies in channel names, topics, and pinned copy.

---

## Server name + identity

- **Name:** RuForge
- **Vanity / invite goal:** discord.gg/ruforge (needs Level 3 boost for custom vanity; use a clean discord.gg link until then)
- **Icon:** `ruforgeAppIcon.png` (same asset the app uses)
- **System messages channel:** `#welcome`
---

## Roles (top to bottom = highest to lowest)

| Role | Color | Who | Key perms |
|------|-------|-----|-----------|
| **Maintainer** | accent (forge orange) | Angel | Administrator |
| **Bot** | gray | Carl-bot, any webhook bot | scoped per bot install |
| **Contributor** | green | merged a PR / shipped help | manage messages in support, embed links |
| **Tester** | blue | runs unreleased builds, files bugs | access to `#testing` category |
| **Member** | default | everyone verified | read/send in public channels |
| **@everyone** | : | unverified arrivals | read-only until they pass the verify gate |

Permission philosophy (from OSS server research): only two groups truly matter : maintainers and everyone else. The middle roles are flair + channel gating, not power tiers.

---

## Channel structure

### 📌 INFORMATION (read-only for Member, locked to Maintainer for posting)
- `#welcome` : landing channel, server intro, one-line what-is-RuForge
- `#rules` : see rules block below
- `#announcements` : **Announcement-type channel** (followable from other servers + webhook target for GitHub releases / ruforge.app updates). This is the highest-value channel in the server.
- `#roles` : Carl-bot reaction roles (grab Tester / notify pings)
- `#faq` : pinned common answers (yt-dlp JS runtime, SmartScreen warning, Windows-only note)
### 💬 COMMUNITY
- `#general` : main chat
- `#showcase` : users post their libraries, setups, playlist organization
- `#off-topic` : non-RuForge chatter
### 🛠 SUPPORT
- `#support` : main help channel (or convert to a **Forum channel** so each issue is its own searchable thread)
- `#install-help` : Windows install, SmartScreen, first-run
- `#bug-reports` : triage here, convert confirmed bugs to GitHub issues (don't track bugs in two places)
### 💡 FEEDBACK
- `#feature-requests` : funnel; later wire the Featurebase/voting board webhook here
- `#feedback` : general product feedback, UX gripes
### 🧪 TESTING (Tester + Maintainer only)
- `#testing` : unreleased build chatter
- `#test-builds` : drop pre-release installers / updater test notes
### 🔧 PROJECT (read-only feeds)
- `#github` : webhook: commits, PRs, issues from UnboundAngel/RuForge
- `#releases` : webhook: GitHub Releases (mirrors what updater.json ships)
### 🔊 VOICE
- `General` voice
- `Office Hours` voice (optional, for live debugging sessions)
---

## Rules (#rules content)

Keep it short and human. No legalese wall.

```
Welcome to RuForge. A few things keep this place good:

1. Be decent. No harassment, slurs, or targeted hate. Disagree without being a jerk.
2. English in public channels so everyone can follow and search.
3. Keep it on-topic per channel. Support goes in support, not general.
4. No piracy talk. RuForge is a local media tool for your own files. Don't ask for or
   share ways to grab content you don't own, paid streams, or anything sketchy. This
   protects the project.
5. No spam, no ads, no DMing members unsolicited.
6. Search before you ask. Your question is probably already answered in faq or an old thread.
7. Bug reports: include your OS, RuForge version, and what you did. "It broke" helps no one.
8. Maintainer's call is final. This is a free project run by one person. Be patient.

Breaking these gets you warned, muted, or removed depending on severity.
```

Note rule 4 deliberately mirrors the website framing rules. Never let the server become a "how do I rip X" hub : that's the DMCA risk the whole project avoids.

---

## Bot stack (all free)

1. **Discord native AutoMod** : first line. Keyword filter (scam phrases, "free nitro"), spam/mention flood, block + alert mods. Zero bot needed, set in Server Settings -> AutoMod.
2. **Carl-bot** (free) : best free logging + the best reaction roles on Discord. Use for: `#roles` reaction roles, mod logging, mute/warn, welcome message. Add via OAuth, configure in its dashboard.
3. **GitHub webhooks** (no bot) : pipe commits/PRs to `#github` and Releases to `#releases`. Set up from the GitHub repo settings, paste the Discord channel webhook URL.
Skip MEE6: its free tier paywalls reaction roles, custom commands, and real auto-mod behind ~$12/mo. Carl-bot does the same job free.

Optional later, only if raids ever happen: **Wick** (aggressive anti-raid). Not needed day one for a small project server.

---

## Setup order (the script does steps 2-4)

1. Create blank server manually (you, in the Discord app). Name it RuForge.
2. Run the Python script with a bot token -> it builds all roles, categories, channels, topics, and the read-only permission overwrites.
3. Manually flip `#announcements` to an Announcement channel and `#support` to a Forum (the API can't always set these cleanly; one click each in the UI).
4. Invite Carl-bot, set AutoMod, wire GitHub webhooks.
