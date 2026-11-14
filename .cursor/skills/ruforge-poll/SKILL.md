---
name: ruforge-poll
description: >-
  Draft and publish a "From the dev" poll or notice in the RuForge bell:
  interview Angel, recommend options, sign with announce.mjs, publish
  announcements.json, verify live. Use only when Angel asks for a poll,
  notice or announcement.
---

# RuForge poll

Mechanics (signing, feed, app side): [`docs/agents/ANNOUNCEMENTS.md`](../../../docs/agents/ANNOUNCEMENTS.md). This file is the workflow.

## When to offer one

Only when Angel brings up a poll or notice, or when a change you just finished is a big addition users would want a say in (a new mode, a major feature direction). Then offer once, in one line, at the end. Never for fixes, polish, refactors or routine work. Never twice in a session.

## 1. Ask (one round)

Ask everything in one go, with the question tool when there is one. Skip what Angel already said. Never ask for what you can fill in (id, published date).

1. What decision will the result feed? (This decides the question wording and the options.)
2. Options: does he have them, or should you recommend? If you recommend, put your list in the same message so he can pick or edit.
3. How long it stays open. Default 14 days; suggest 7 for small calls, 21-30 for roadmap direction.

## 2. Recommend options

- 3 or 4 options. 2 only for a true either/or, never more than 6.
- Same kind and size of thing in every option (all features, or all colors). No option that contains another.
- Labels short and parallel: aim for 28 characters or fewer so they fit the bell row without scrolling, hard cap 60.
- Ground feature options in `STATE.md` Next 3 / Open P0 and `website/src/content/roadmap.json`. Do not offer what is already shipped or ruled out (Shorts, a second inbox).
- Add "Keep it as is" when the poll is about changing something users already have.
- No "Other": there is no free text. No joke options. Order neutrally; do not lead with the option you favor.
- Question: one line, a real question ending in "?", 50 characters or fewer if possible (hard cap 80). No body: polls show only the question and options.
- Say in one line why you chose these options.

## 3. Preview and confirm

Show it the way the bell will show it, then wait for an explicit yes to post:

```
What should RuForge build next?
A  Movies mode
B  Download history
C  Playlist sync
Closes 2026-11-01
```

## 4. Sign and publish

```
node scripts/announce.mjs poll <kebab-id> --title "<question>" --ends YYYY-MM-DD --option "<A>" --option "<B>" ...
node scripts/announce.mjs verify
node scripts/publish-snapshot.mjs --only website/public/announcements.json --dry-run
RUFORGE_PUBLISH=1 node scripts/publish-snapshot.mjs --only website/public/announcements.json "Poll: <question>"
```

The key is on Angel's machine (`%USERPROFILE%\.ruforge\announce-ed25519.pem`). If it is missing, stop and tell him; never generate a new one (`keygen` means a new app release).

Then commit and push the signed file to sync with the commit trigger.

## 5. Verify live

After Cloudflare deploys (a minute or two):

```
curl -s https://ruforge.app/announcements.json
curl -s "https://ruforge.app/api/poll?id=<kebab-id>"
```

The second must return the options with counts, not `unknown_poll`. Tell Angel the apps pick it up within 6 hours (launch or the next refresh).

## Changing a live poll

- Never edit options of a poll that has votes; votes are keyed by option id. Remove it and post a new id.
- To end early, re-add it with an earlier `--ends`, or `remove` it to hide it everywhere.
- Notices: `announce.mjs notice <id> --title T --body B [--link https://ruforge.app/...]`, same publish and verify steps. Body max 280 characters, links only on ruforge.app.
