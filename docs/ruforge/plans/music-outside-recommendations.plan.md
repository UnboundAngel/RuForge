# Music: recommend songs from outside the library

Goal: the playlist page's "Recommended" section suggests songs the user has not downloaded yet, next to the library suggestions it shows today, with an `Add` that downloads the song and then puts it in the playlist.

Status (2026-09-26): research and plan only. Nothing built.

## Today

`src/components/music/musicPlaylistRecommend.ts` ranks library files only: the playlist's artists first, then its albums, then the newest downloads. `MusicPlaylistFinder.tsx` renders it. It is instant, offline, and can never suggest something new.

## Who else does this (checked 2026-09)

- **Nuclear** (desktop, open source): searches YouTube for related songs, shows similar artists, albums and tracks, and plays local files. The closest match to the idea.
- **Lokal** (Windows, open source): a local library, downloads through yt-dlp, and "related-song radio suggestions". The README does not say where the suggestions come from.
- **InnerTune / OuterTune** (Android): local files plus YouTube Music, with up-next and radio taken from YouTube Music itself.
- **ytmusicapi** (the reference unofficial YTM client): `get_watch_playlist(videoId, radio=True)` returns the radio for a song. Radio playlist ids are `RDAMVM` followed by the video id.
- **Spotify Web API**: closed to us. Recommendations and Related Artists return 403 for apps created after 2024-11-27, and there is no waitlist.

So the idea is proven. Nobody puts it inside a local playlist builder with download-then-add, which is where RuForge would differ.

## Sources compared

| Source | Signal | Gives a downloadable id | Cost / terms | Verdict |
|---|---|---|---|---|
| YouTube Music radio (`RDAMVM<id>`) through our yt-dlp | Good; it is what YTM plays next | Yes, video ids | None new. Shares the yt-dlp rate limit | **v1** |
| Last.fm `track.getSimilar` / `artist.getSimilar` | Best "similar" signal (listening data, match 0..1) | No; needs a YTM search per song | API key, non-commercial only unless licensed, "powered by AudioScrobbler" attribution with links, 100 MB cache cap | Optional later seed source |
| ListenBrainz (similar artists, LB Radio) | Decent, open data, keyed by MBID (we already store `mbReleaseId`) | No | Free; the similar-artist endpoints are "Labs" | Later, if Last.fm terms bite |
| Spotify | n/a | n/a | Closed | No |

## Decision

v1 uses YouTube Music radio through the yt-dlp we already ship. Every downloaded song already carries `sourceId` (the YouTube video id) in `MediaFile`, so a radio seed costs no lookup. Results come back as video ids the downloader takes directly, so there is no name-matching step. It needs no API key and no new terms.

## Design

### Fetch

- **Seed:** one playlist song with a `sourceId`, chosen by artist weight (the same weights the local ranker uses). Refresh rotates to the next seed.
- **Call:** `https://music.youtube.com/watch?v=<id>&list=RDAMVM<id>` through the existing `get_playlist_items_page` (`--flat-playlist -J`, `music_ytdlp_mutex`). This may need no Rust change at all; the spike confirms it. If it doesn't work, add a small `get_music_radio(video_id, limit)` next to it.
- **Rate limit:** `ytdlp_rate_limit.rs` spaces spawns by 2.5 s and blocks every yt-dlp browse for 5 minutes after a 429. Recommendations must never cause that cooldown for Explore:
  - one seed per fetch;
  - fetch only when the Recommended section scrolls into view;
  - skip, silently, while a cooldown is active;
  - cache per seed id for 24 hours, so Refresh pages through the cached pool before fetching again.

### Merge (pure function, unit tested)

`mergeOutsideRecommendations(radio, library, playlist)`:

- drop the seed itself, anything whose id matches a library `sourceId`, and anything already in the playlist;
- dedupe by normalized title plus artist, so a music video and its audio version count once;
- read the artist from `artist`, falling back to `channel` with " - Topic" stripped;
- cap at 10.

### UI (Spotify layout, red and black)

- One Recommended list. Library songs come first, then outside songs, with no second header, since Spotify shows a single list.
- An outside row shows its YTM thumbnail, title and artist. A small cloud-download glyph with a tooltip "Not downloaded" sits where the album column would be.
- `Add` on an outside row:
  1. queues the download through the existing music download path (`MusicExploreDownloadPanel` flow);
  2. swaps the button for a progress ring;
  3. once the scan finds a file with that `sourceId`, adds its path to the playlist and fades the row out.
- Pending adds (`videoId -> playlistId`) persist, so closing the page or the app mid-download still ends with the song in the playlist.
- Loading shows three skeleton rows under the local ones and never delays the local list. Offline, rate-limited or empty means local rows only, with no error banner.
- A Music setting, "Suggest songs from YouTube Music", on by default. The seed ids go to YouTube, so the user can turn it off.

## Phases

0. **Spike on Angel's Windows machine.** Run yt-dlp against `RDAMVM<sourceId>` for two or three real library songs. Record the time taken, the entry count, and which fields come back (artist or channel, duration, thumbnails). The spike could not run from the cloud container because YouTube answered 429 to its IP. The request did route to yt-dlp's `youtube:tab` extractor, which handles mixes.
1. **Data.** A TS wrapper, the merge function, the seed picker and the 24-hour cache, with vitest coverage for merge, dedupe, seed rotation and cache expiry.
2. **UI.** Outside rows, skeletons and the setting toggle, previewed in the harness with a stubbed radio response.
3. **Add flow.** Download, pending-add persistence, resolve on scan, and progress state. Test the resolver.
4. **Optional.** A Last.fm similar-artists seed for playlists whose songs have no `sourceId` (files imported from elsewhere), behind a user-supplied API key.

## Risks

- **Rate limit spillover** into Explore. Mitigated by the lazy, cached, single-seed fetch and the cooldown skip. This is the main one.
- **YouTube changes.** Radio parsing breaks when yt-dlp does. Updating yt-dlp fixes it, and the section falls back to local.
- **Artist quality.** Flat entries can lack `artist`. The channel name is the fallback, and canonical metadata arrives after download anyway.
- **Scope creep into streaming.** v1 does not preview or stream outside songs. Adding one means downloading it.
