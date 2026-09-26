# Music playlists (Spotify-style)

Goal: make creating and filling playlists in RuForge Music take one or two clicks from anywhere a song appears, the way Spotify does it.

## What Spotify does (desktop, verified 2026-09)

1. **Create from the library column.** "Your Library" has a `+ Create` button at the top. Picking Playlist creates it immediately with a default name ("My Playlist #N") and opens its page. No modal first. `Ctrl+N` does the same.
2. **Empty playlist page is a builder.** The new page shows the header (cover mosaic, name, "0 songs") and, below it, "Let's find something for your playlist" with a search box. Results have an `Add` button per row, so you fill the playlist without leaving it. Once it has songs, "Recommended songs" (from title + contents) sits at the bottom.
3. **Edit details inline.** Click the name or cover to open a small "Edit details" dialog: name, optional description, cover image. Cover defaults to a 2x2 mosaic of the first four distinct album arts.
4. **Add from anywhere.** Right-click any track (or the `...` button) > `Add to playlist` opens a submenu: search field, `New playlist` at the top, then playlists. Newer builds show a checkbox list so one song can go into several playlists at once, with playlists that already contain it marked as saved.
5. **Drag and drop.** Drag a track (or a multi-selection with Ctrl/Shift) onto a playlist in the sidebar.
6. **Duplicate guard.** Adding a song that is already present asks "Already added" with `Add anyway` / `Don't add`.
7. **Inside a playlist.** Drag rows to reorder, right-click > `Remove from this playlist`, sort by custom order / title / artist / date added.
8. **Sidebar presence.** Every playlist lives in the left column with its cover, name, and song count, so it doubles as a drop target and quick jump.
9. **Delete** from the playlist's context menu, with a confirm.

## What RuForge already has

- `src/virtualPlaylists.ts` + store actions (`createVirtualPlaylist`, `addToVirtualPlaylist`, `removeFromVirtualPlaylist`, `reorderVirtualPlaylist`, `renameVirtualPlaylist`, `setVirtualPlaylistThumbnail`, `deleteVirtualPlaylist`). Records are path-based, stored in localStorage (`ruforge-virtual-playlists`), and merged into `entries` as `virtual:<id>` playlists.
- `SaveToPlaylistModal.tsx` (main app, video-oriented bezel styling) and `PlaylistDetailView.tsx`.
- Music mode has none of this surfaced: `MusicRowContextMenu` has Play / Like / Queue / Go to / File, `MusicNav` has Home / Explore / Library, `MusicDetail` has no playlist kind.

So this is mostly a Music UI project on top of a working data layer. No Rust needed for v1.

## Decisions

- **One data model.** Music playlists are virtual playlists. Add `kind?: "video" | "music"` to `VirtualPlaylistRecord` (default `"video"` for existing records) so Music only lists music playlists and Watch later stays out of Music. A mixed record is allowed; the filter is on `kind`, not contents.
- **No naming modal on create.** Match Spotify: create "My Playlist #N", open it, title is editable in place. A modal before the playlist exists is the friction we are removing.
- **Audio-only filter when adding.** The Add-to-playlist picker in Music only offers `kind: "music"` playlists; the builder search only searches `isAudioOnlyPath` tracks.
- **Duplicates skip silently for multi-add, prompt for single add.** Single add of a present song shows a toast with `Add anyway`. Bulk adds (album, artist, selection) dedupe and report "Added 7, 3 already in playlist".

## Risks to fix before shipping

- **Stale-path pruning deletes playlist items.** `pruneStalePathsInRecords` drops items whose file is not in the current scan. A temporarily missing library root, a migration, or a partial scan would silently empty music playlists. For `kind: "music"`, keep missing items and render them greyed ("File missing"), or prune only after a successful full scan. This is the one real P0 in the plan.
- **localStorage durability.** Fine for v1 (Liked already lives there), but playlists are user-authored data that people will spend time on. Phase 4 moves them to a JSON sidecar via Tauri so they survive a WebView storage reset and can be exported.
- **Identity by path.** Moving or re-tagging a file breaks the link. Acceptable for v1 since Liked uses `musicTrackIdentityKey`; consider storing that key alongside `path` so a rescan can re-resolve moved files.
- **Two webviews.** Music runs in the main webview today, so Zustand is enough. If the mini player ever mutates playlists, sync via emit/listen like the rest.

## Status (2026-09-26)

Phases 1 to 3 are built on `claude/nifty-mayer-e73q2w`, plus the pruning fix (sync no longer prunes; missing songs show a "Remove from playlist" banner on the playlist page). Library flatten now skips virtual playlists so songs in a playlist are not listed twice in Music.

Not yet built: collapsed-sidebar playlist covers, multi-select (Ctrl/Shift), drag sources on Artist page rows and Home rows, and all of Phase 4. There's no duplicate prompt; the checkbox picker replaces it, and adding a song that is already there is a no-op.

## Phases

### Phase 1: Add to playlist from anywhere (smallest useful slice)

- `MusicRowContextMenu`: new `Playlist` section (new tone in `MUSIC_MENU_TONES`) with `Add to playlist` for song, album, and artist contexts. Album/artist add every track.
- `MusicAddToPlaylistMenu.tsx`: flyout anchored to the row, built on `MusicFloatingMenu`. Search input, `New playlist` row at the top, then checkbox rows (cover, name, count) with a check on playlists that already contain the song. Toggling a check adds or removes immediately. `New playlist` creates "My Playlist #N" seeded with the song(s) and toasts "Added to My Playlist #N" with an `Open` action.
- Store: `createMusicPlaylist(seedPaths?) => id`, `nextDefaultPlaylistName()`, `musicPlaylistsContaining(path)`.
- Tests: default name numbering, dedupe, `kind` filter, containing lookup.

### Phase 2: Playlists as places

- `MusicDetail` gets `{ kind: "playlist"; id: string }` and `openMusicPlaylist(id)`.
- `MusicPlaylistView.tsx` (split: header, track list, empty builder), reusing `MusicLikedView` patterns: cover mosaic, name, count, total duration, Play / Shuffle, row context menu with `Remove from this playlist`.
- Empty state is the builder: search box over library tracks with `Add` per row. Keep it visible under the list as "Find more" once the playlist has songs.
- Inline edit: click title to rename; `...` menu with Rename, Change cover (pick from track arts), Delete (confirm).
- Queue source: new `MusicQueueSourceKind` `"playlist"` so Now Playing shows "Playing from My Playlist #1".

### Phase 3: Library column and creation entry points

- `MusicNav`: "Playlists" group under the nav items with `+` button, Liked Songs pinned first, then music playlists sorted by last played/updated. Collapsed nav shows covers only.
- Library tab `Playlists` with a grid and a `New playlist` tile.
- `Ctrl+N` in Music mode creates and opens a playlist.
- Drag rows from any list onto a sidebar playlist (HTML5 drag with a custom ghost; the queue already uses drag, reuse its pattern). Multi-select with Ctrl/Shift in Songs and playlist views, then add or drag the selection.
- Reorder inside the playlist by drag, reusing `musicQueueReorder`.

### Phase 4: Durability and extras

- Persist music playlists to `app_data/music-playlists.json` via a Tauri command, one-time migrate from localStorage, keep localStorage as fallback cache.
- Store `identityKey` per item and re-resolve moved files on rescan.
- Sort options (custom, title, artist, date added). Description field.
- Export as `.m3u8` (pairs with the existing export work). Import `.m3u8`.
- Later, optional: "Recommended songs" from same artists/albums in the local library, and "Save YouTube Music playlist as RuForge playlist" after a playlist download from Explore.

## Suggested order and size

Phase 1 first: it is small (one menu, one flyout, three store helpers) and gives the core Spotify behavior. Fix the pruning risk in the same PR, since Phase 1 is the first time music users can author playlists. Phase 2 and 3 together make it feel like Spotify. Phase 4 before calling the feature done in release notes.

## Sources

- Spotify Support, Create and edit playlists: https://support.spotify.com/us/article/create-playlists/
- Spotify Community, add the same song to multiple playlists (implemented): https://community.spotify.com/t5/Implemented-Ideas/All-Platforms-Playlists-Add-the-same-song-to-multiple-playlists/idi-p/4841642
- Spotify Community, duplicate songs prompt: https://community.spotify.com/t5/Your-Library/Duplicate-songs-on-playlist/td-p/5518045/page/2
- SoundGuys, how to make a playlist on Spotify: https://www.soundguys.com/how-to-make-a-playlist-on-spotify-99748/
