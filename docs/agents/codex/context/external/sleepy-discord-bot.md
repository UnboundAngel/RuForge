> External project context for Sleepy, the RuForge Discord bot.
> The bot lives outside this repo. Do not apply this file to RuForge app code.

Context for any AI agent working on Sleepy or the RuForge Discord server. Read this first, update it last.

What this is
Sleepy is the RuForge Discord bot. discord.py 2.7.1, Python 3.10+, SQLite, aiosqlite. Slash commands only. No prefix commands.
The RuForge Discord server is the community hub for the RuForge desktop app. Support, announcements, feature requests.

Repo: UnboundAngel/discord_bots (private)
Local path: c:\Random things i dont want deleted\Utils\discord_bots\
Entry point: main.py
Run: activate .venv first, then python main.py

Deploy state: Live on Oracle Cloud Always Free VM. Ubuntu 22.04, 129.80.76.181. Systemd service sleepy.service, auto-starts on boot, auto-restarts on crash. SSH: ubuntu@129.80.76.181, key at C:\Random things i dont want deleted\IMPORTANT\ssh-key-ruforge-bot.key. One-click: connect-sleepy-bot.bat on Angel's desktop.

Slash commands
CommandAccessWhat it does/syncownerGlobal command tree sync; clears guild-scoped copies to prevent duplicates/sync-guildownerSame as /sync but scoped to DEV_GUILD_ID; use for fast dev refresh/faqNightowl+Ephemeral FAQ lookup by key; autocomplete/faq-addownerUpsert a FAQ entry (key, topic, answer, keywords)/ticketNightowl+Modal → tag select → forum post in #support/suggestNightowl+Post a feature request to #feature-requests with vote buttons/suggest-statusownerUpdate a suggestion's status; edits the original embed
Listeners (no command):

on_message : FAQ keyword auto-reply in support channels (public, not ephemeral)
on_member_update : auto-assigns Nightowl when membership screening completes
POST /webhook/github on port 8080 : posts GitHub release embeds to #releases


Cogs
CogStatusNotescogs/admin.pylive/sync, /sync-guildcogs/faq.pylive/faq, /faq-add, keyword listenercogs/tickets.pylive/ticket → forum post in #supportcogs/feedback.pylive/suggest, /suggest-status, persistent vote buttonscogs/autorole.pyliveAuto-assigns Nightowl on screening completecogs/releases.pyliveGitHub webhook → #releases embedcogs/placeholder.pyscaffoldEmpty template for new cogs
Cogs are loaded dynamically : glob scan of cogs/*.py, skip _*.py. Adding a new file is enough; no manual register in main.py.

Discord server
Community identity: nightowls (singular: nightowl). The gate is an invitation, not a wall.
Role hierarchy (top to bottom):

Maintainer (Angel, Administrator)
Contributor (merged a PR / shipped help)
Tester (runs unreleased builds)
Nightowl (completed membership screening : auto-assigned by Sleepy)
Member (everyone else, read-only until screening)

Key channels:

#support : Forum channel. /ticket posts land here.
#feature-requests : /suggest posts land here. Public read (non-Nightowl can vote).
#releases : GitHub release embeds from Sleepy webhook.
#announcements : Announcement channel type (followable).
#faq : Pinned static answers.

Permission gate: Community slash commands (/faq, /ticket, /suggest) require Nightowl or above. Checked via @requires_gated_access() in utils.py : top role position >= Nightowl position. Owner commands use @is_owner() from utils.py against config.OWNER_ID. Never use @commands.is_owner() on slash commands : it doesn't work.
External tools: Discord AutoMod handles keyword/spam filtering. Carl-bot handles reaction roles. Sleepy does not duplicate either.

Sleepy voice (the short version)
Full guide in SLEEPY_VOICE.md. Key rules:

Warm full sentences. Tired-but-warm character, not a system toast.
.. for a sleepy pause beat, used sparingly : once per message max.
Bold only when emphasis genuinely earns it. Zero bold is fine.
No em-dashes. Ever. Not in strings, not in comments, not anywhere.
Blocks are invitations: "It looks like you're not a nightowl yet, become one to open a ticket!"
Idle ticket close: DM to the opener only. Thread archives silently. No thread message.
Reference Angel as "my owner" where it fits naturally.
FAQ embeds and admin confirmations use neutral tone, not Sleepy voice.


Hard rules (never touch these)

No tree.sync() on startup : owner syncs manually via /sync or /sync-guild
No prefix commands : slash only
load_dotenv(override=True) stays in config.py forever : removing it causes ghost-var env bugs
No transcript system : not built, do not add without explicit request
No /ticket close slash command : tickets are forum posts with no bot-managed close
No XP, levels, leaderboards, complex reaction roles : Carl-bot and AutoMod handle those
No GPL code in the repo


Key IDs (read-only, never hardcode in cogs : use config.*)
ThingValueBot ID1519089990980866090Dev guild ID1519115738038665337Owner ID1056650574503870474Nightowl role ID1520103403701797045

Env vars
KeyRequiredDefaultDISCORD_TOKENyes:OWNER_IDyes:DEV_GUILD_IDnoNoneDB_PATHnodata/bot.dbLOG_LEVELnoINFOGITHUB_WEBHOOK_SECRETno*""GITHUB_CHANNEL_NAMEnoreleasesWEBHOOK_PORTno8080
*Bot starts without it but all webhook requests return 401.

Prompts always start and end the same way
Every Cursor prompt for Sleepy: start with "read SLEEPY.md first", end with "update SLEEPY.md to reflect what changed." No exceptions.
