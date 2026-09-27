# Playlist import (screenshots or text, any chatbot)

Goal: let a user rebuild a playlist from another service (Spotify, Apple Music, Tidal, a friend's phone) without RuForge shipping an AI or an API key. The user's own chatbot reads the screenshots and returns JSON; RuForge does the searching, matching, review, and downloading.

## Phases

1. **Prompt template (this plan).** Music gets an `Import list` entry. The modal has `Copy prompt`, a paste box for the JSON, and `Continue`. RuForge parses, searches, scores, and opens the review screen.
2. **Terminal import (later).** `ruforge.exe --import <file.json>` forwarded to the running app through the existing `tauri-plugin-single-instance` (already in `src-tauri/Cargo.toml`). It opens the same review screen and never downloads without confirmation. Not through Companion: its scope doc forbids it becoming a downloader.
3. **In-app chat button (maybe never).** Would reuse the same format and pipeline.

The JSON format below is the contract all three share. Change it only by bumping `ruforge_import`.

## Format (version 1)

```json
{
  "ruforge_import": 1,
  "playlist": {
    "name": "Late Night Drive",
    "source": "spotify"
  },
  "tracks": [
    {
      "title": "Blinding Lights",
      "artists": ["The Weeknd"],
      "album": "After Hours",
      "duration": "3:20",
      "unclear": false
    },
    {
      "title": "Get Lucky (feat. Pharrell Williams & Nile Rodgers)",
      "artists": ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      "album": null,
      "duration": null,
      "unclear": false
    }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `ruforge_import` | number | yes | Format version. `1` today. |
| `playlist.name` | string or null | no | Default name for the new playlist. |
| `playlist.source` | `"spotify"`, `"apple_music"`, `"youtube_music"`, `"tidal"`, `"soundcloud"`, `"other"` or null | no | Only used for copy and stats. |
| `tracks[]` | array, order = playlist order | yes | At least one row. |
| `title` | string | yes | Exactly as shown, including `(feat. …)`, `- Remastered 2011`, `(Live)`. The scorer needs those words. |
| `artists` | string[] | yes | One entry per artist. |
| `album` | string or null | no | |
| `duration` | `"m:ss"`, `"h:mm:ss"` or null | no | As displayed. Biggest single matching signal when present. |
| `unclear` | boolean | no | `true` when the text was cut off or hard to read. Row goes straight to manual review. |

### Why this shape

These are the conventions that chat models follow most reliably when there is no API-level structured output mode (chat UIs don't expose one):

- **Flat, few fields, one concrete example in the prompt.** Models copy an example far more faithfully than they follow a prose schema. Nesting stops at one level.
- **`null` over omission, and an explicit "don't guess" rule.** Gives the model a sanctioned way to say "not visible" instead of inventing an album or duration.
- **An escape hatch (`unclear`).** Without one, models silently "fix" half-visible titles into plausible wrong ones.
- **Order is implicit.** No `position` field to get wrong; array order is the order.
- **Strings for durations.** The model copies `3:20` as shown; converting to seconds invites arithmetic errors. The parser converts.
- **A version key with a distinctive name.** Lets the parser recognise RuForge JSON inside a noisy reply and reject JSON meant for something else.
- **Single fenced code block, nothing else.** Asked for explicitly, then enforced by a tolerant parser anyway (below).

## Parser rules (tolerant in, strict out)

Assume the reply is messy. In order:

1. Strip everything outside the first ```` ```json ```` fence if present, else take the span from the first `{` to the matching last `}`.
2. `JSON.parse`. On failure, try one light repair (remove trailing commas before `]`/`}`, replace smart quotes) and parse again. Still failing: show the parse error with line and column. Don't guess further.
3. Accept a bare top-level array as `tracks` with version 1. Accept `artist` (string) as `artists: [artist]`, and split a single `"A, B & C"` string only when the separator is `,` or ` & `.
4. Validate per row. A row missing `title` or `artists` is dropped and reported as "Row 14: no title", not a whole-import failure.
5. Duration that doesn't parse becomes `null` (row stays).
6. Dedupe rows with the same normalized `title` + first artist that are adjacent or within 3 rows of each other (screenshot overlap). Keep deliberate repeats that are far apart.
7. Cap at 1000 rows; say so if truncated.

Output is a strict internal type (`ImportTrack { title, artists, album, durationSec, unclear }`), never the raw JSON.

## Matching (deterministic, no AI)

Per row, search YouTube Music first, then YouTube (`ytsearch5:` via yt-dlp) when YTM has no confident hit. Score each candidate:

- Duration delta: strongest signal. Within 3 s strong, within 10 s fine, over 30 s heavy penalty.
- Normalized title similarity (lowercase, strip punctuation, drop `official video`/`audio`/`lyrics` noise from the candidate).
- Artist present in channel name or title; `Artist - Topic` channels get a bonus.
- Penalize `live`, `cover`, `remix`, `sped up`, `slowed`, `8d`, `karaoke`, `instrumental` when the source title lacks the same word.

Buckets: **matched** (high score), **check** (medium or `unclear`), **not found**. The storage-cap check (#10) runs on the final selection before enqueue.

## Review screen

Source row on the left, chosen match on the right with a confidence dot, an alternatives dropdown (top 5), optional stream preview, and a per-row include checkbox. Filters for `Check` and `Not found`. `Save` creates a `kind: "music"` virtual playlist named from `playlist.name`, enqueues downloads, and adds each track to the playlist as its download completes (virtual playlists are path-based, so a row can only join once its file exists).

## The prompt (copied by the `Copy prompt` button)

Keep this text in one place in code (`src/playlistImport/importPrompt.ts`) so the modal and docs never drift.

````text
I'm going to give you screenshots (or pasted text) of a music playlist. Turn it into JSON for the RuForge music app.

Rules:
- Reply with ONE ```json code block and nothing else. No explanation before or after.
- Use exactly this shape:

```json
{
  "ruforge_import": 1,
  "playlist": { "name": "Playlist name or null", "source": "spotify" },
  "tracks": [
    { "title": "Song title", "artists": ["Artist 1", "Artist 2"], "album": "Album or null", "duration": "3:20", "unclear": false }
  ]
}
```

- "source" is one of: spotify, apple_music, youtube_music, tidal, soundcloud, other, or null.
- List every song in the order it appears, top to bottom, screenshot by screenshot.
- The screenshots may overlap. If the same song appears at the bottom of one screenshot and the top of the next, list it once.
- Copy titles and artist names exactly as shown, including things like "(feat. ...)", "- Remastered", "(Live)". Don't fix spelling, don't translate, don't shorten.
- Put each artist in its own string in "artists".
- "duration" is the length exactly as shown (like "3:20"), or null if it isn't visible. Do not use the "date added" or play count columns.
- If something isn't visible, use null. Never guess or fill in from memory.
- If a title or artist is cut off or hard to read, write what you can see and set "unclear": true.
- Skip anything that isn't a song (ads, headers, "recommended" sections below the playlist).
````

## Test plan

- Parser unit tests: fenced reply, reply with chatter before/after, bare array, trailing commas, smart quotes, `artist` string, bad row mid-list, overlap dedupe, far-apart repeat kept, 1001 rows.
- Manual: real Spotify and Apple Music screenshots (desktop and phone) through ChatGPT, Claude, and Gemini free tiers; record which models needed the repair path.

## Open questions

- Should `check` rows be excluded from `Save` by default, or included with their best guess?
- Default playlist name when `playlist.name` is null: `Imported playlist` or `My Playlist #N` (current Music default)?
