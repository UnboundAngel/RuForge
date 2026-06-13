# Context handoff: Activity Island Pass 1 (persistent audio)

For a new agent chat continuing **review** or **implementation** on this workstream.
Read `STATE.md` and `AGENTS.md` first; this doc is the slice-specific cursor.

**Repo:** RuForge (Tauri v2 + React 19 + Zustand). Workspace: `neotube`.
**Open cycle:** `0.1.11 (unreleased)`. Last user release: `0.1.10`.
**Prior chat:** Activity Island Pass 1, phases A through E-audio + polish fixes.

---

## North star (Pass 1 scope)

**Persistent audio across navigation** in the main window. Video persistence off-tab is **Phase C**, explicitly deferred.

The **Activity Island** (top-center pill/card in `App.tsx`) reflects playback when the user is not on the surface that owns it:

| Render state | When | Island visible | Playback source |
|---|---|---|---|
| `main-music` | Audio playing, `activityOwner` null | `navMode !== "music"` | **Live** host bridge |
| `main-video` | Video playing, `activityOwner` null | `activeTab !== "player"` | **Frozen** `playbackStorage` resume |
| `mini-owned` | `activityOwner` is `music-mini` or `video-mini` | Always | Stub (handoff snapshot) |
| `idle` | No playing file / no handoff | Hidden | n/a |

---

## Phase status

| Phase | Goal | Status |
|---|---|---|
| **A** | `MainPlaybackHost` + bridge arbitration (`host-audio` vs `player-video`) | **Done** |
| **B** | Audio survives leaving music mode; `MusicShell` uses host, no local `<audio>` | **Done, signed off** |
| **D-audio** | Exclusivity: main claim stops both minis, mini teardown clears stub, handoff-sync, delete parity | **Built**; matrix mostly signed off, cold-boot re-verify #5 + B seek |
| **E-audio** | Live `main-music` island off music mode; remove frozen music fallback + debug logs | **Done (code)**; E-audio GUI checks 2-5 pending Angel |
| **C** | Persistent video off player tab | **Not started** |
| **E-video** | (if any) N/A until C | **Deferred** |

---

## Architecture (mental model)

```
App.tsx
  MainPlaybackHost          ← persistent hidden <audio>, useMusicPlayback engine
    MainPlaybackProvider    ← publishes bridge when shouldHostOwnBridge()
    … shell (navMode fork) …
    ActivityIsland          ← useCurrentActivity + bridge subscribe

MusicShell (navMode === "music")
  useMainAudioPlayback()    ← throws if outside host (singleton context on globalThis)

PlayerView (activeTab === "player")
  useOptionalMainAudioPlayback()  ← audio-only delegates to host
  MainPlaybackProvider (player-video) when video on player tab

music-mini / video-mini
  Separate webviews; handoff via Tauri emit + activityOwner / activityHandoff in store
```

**Bridge rules** (`src/playback/bridgeArbitration.ts`):

- `host-audio`: `playingFile` is audio-only AND `activityOwner` is null.
- `player-video`: `playingFile` is video AND `activeTab === "player"`.

**Engine gate** (`useMusicPlayback.ts`): `engineActive = isAudioOnlyPath(playingFile) && !activityOwner`. No `navMode` gate (Phase B).

**Island show rule** (`src/lib/activityIslandResolve.ts`):

```ts
main-music  → navMode !== "music"
main-video  → activeTab !== "player"
mini-owned  → true
```

**Island play/pause** (`ActivityIsland.tsx`):

- `main-music`: `playback.togglePlay()` only (no `setActiveTab`).
- `main-video`: live bridge toggle if present, else `setActiveTab("player")` (frozen resume).

---

## Key files (review these first)

### Host + bridge

| File | Role |
|---|---|
| `src/playback/MainPlaybackHost.tsx` | Host mount, audio element, bridge publish |
| `src/playback/mainAudioPlaybackContext.ts` | `useMainAudioPlayback` / `useOptionalMainAudioPlayback` (singleton context) |
| `src/playback/bridgeArbitration.ts` | Who owns bridge |
| `src/lib/mainPlaybackBridge.ts` | External store for island + off-surface consumers |
| `src/context/MainPlaybackContext.tsx` | `publishMainPlaybackBridge` on active/inactive |
| `src/components/music/useMusicPlayback.ts` | Single audio engine (lives in host) |

### Island

| File | Role |
|---|---|
| `src/hooks/useCurrentActivity.ts` | Render state, live vs frozen time, cover/accent |
| `src/lib/activityIslandResolve.ts` | Pure show/hide rules (+ `activityIslandResolve.test.ts`) |
| `src/components/island/ActivityIsland.tsx` | Pill/card UI, play/pause routing |
| `src/lib/activityTypes.ts` | `ActivityOwner`, `ActivityRenderState`, etc. |

### Exclusivity (D-audio)

| File | Role |
|---|---|
| `src/lib/mainPlaybackClaim.ts` | `claimMainPlayback`, `closeVideoMiniWindow`, `stopMusicMiniForMainClaim`, `stopVideoMiniForMainClaim`, `emitVideoMiniTeardown` / `emitMusicMiniTeardown`, `closeVideoMiniFromMini` / `closeMusicMiniFromMini` |
| `src/store/ruforgeStore.ts` | `setPlayingFile`, `stopPlayback`, `handlePlayFile`, `syncActivityHandoff`, `activityOwner`, `activityHandoff` |
| `src/releasePlaybackBeforeDelete.ts` | Delete/cleanup releases handoff + playing file + closes video-mini |
| `src/lib/activityHandoffSync.ts` | `emitActivityHandoffSync` to main on in-mini file change |
| `src/App.tsx` | `stop-playback`, `activity-mini-teardown`, `activity-handoff-sync` listeners |
| `src/MiniPlayer.tsx` | `onCloseRequested`, `returnToLibraryBrowse`, `handleSelectMedia` → handoff-sync + `"mini-player"`; handoff seek retry |
| `src/components/music-mini/MusicMiniPlayer.tsx` | Music-mini teardown on close/back |

### Polish (same cycle)

| File | Change |
|---|---|
| `src/components/music/NowPlayingBar.tsx` | Non-passive wheel listener (volume scroll) |
| `src/store/ruforgeStore.ts` | `waitForMusicMiniReady()` before `play-in-music-mini` emit |
| `src/lib/musicListenSession.ts` | Stale adopt falls through to fresh `music_listen_begin` |

---

## Shipped log mirror (`AGENTS.md` v0.1.11 unreleased)

- **Playback (D-audio):** unified `claimMainPlayback()` + `activity-mini-teardown` island stub clear.
- **Handoff sync:** `activity-handoff-sync` from video/music mini updates island metadata on in-mini file change (`activityHandoffSync.ts`, `App.tsx`, `MiniPlayer.tsx`, `useMusicMiniPlayback.ts`).
- **Video mini seek:** handoff seek retries on `loadedmetadata` when first attempt runs at `duration === 0` (`MiniPlayer.tsx`).
- **Boot splash:** Siri-style edge orbs loader.
- **E-audio:** live main-music island; main-video frozen unchanged; debug ingest logs removed.
- **Music polish:** mini-ready-before-emit, passive wheel fix, stale listen adopt.
- **D-audio (routing):** `"mini-player"` partial clear preserves handoff; music-mini `stop-playback` ignored when mini-owned.
- **Onboarding:** demo overlay (separate workstream).

---

## Verification checklist

### E-audio (Angel GUI, cold boot, no HMR)

Run `npm run tauri dev` on a **fresh** process (kill old dev, free port 1420 if needed).

1. **Boot / providers:** enter music mode, play audio, open audio in player tab. No `useMainAudioPlayback must be used within MainPlaybackHost`.
2. **Live off-surface:** play music → leave music mode → island appears, waveform animates, audio continues.
3. **Live toggle:** island play/pause toggles actual audio (does not reopen music mode).
4. **Video frozen:** play video → leave player tab → island shows frozen resume; play opens player (unchanged).
5. **Mini stub:** pop out music to mini → island flips to mini-owned stub.

Automated: `npm run build`, `npm test` (83 tests incl. `activityIslandResolve.test.ts`).

### D-audio exclusivity matrix (Angel, cold boot, no HMR)

Prerequisite for all: fresh `npm run tauri dev` (kill old process, free port 1420).

| # | Gesture | Expected |
|---|---|---|
| 1 | Video-mini playing → shuffle/play from Media on main | Video-mini stops; main plays new file |
| 2 | Video-mini handoff (pop out) → Close X on mini | Island stub clears (`activityOwner` / `activityHandoff` null) |
| 3 | Video-mini handoff → track ends | **If next in mini queue:** advances to next file; island stub **stays**, metadata syncs via `activity-handoff-sync`. **If no next:** `returnToLibraryBrowse`; island clears |
| 4 | Pop out video-mini, still playing (no close) | Island stub **remains** (mini-owned) |
| 5 | Video-mini handoff active → open mini media selector → pick a **different** file | Main `playingFile` cleared only; handoff preserved; island title/cover update to new file |
| 6 | Music-mini handoff → TitleBar X | Island stub clears |
| 7 | `send-to-music-main` or `send-to-main` from mini (back to main) | Main claims playback; both minis stopped |

**Scenario 5 note:** `"mini-player"` emits from video-mini on initial `play-in-mini` takeover and on `handleSelectMedia` (including queue advance via `onEnded`). Island metadata comes from `activityHandoff`, updated by `activity-handoff-sync` on each in-mini file change.

**Island re-render path** (`useCurrentActivity.ts`): Zustand `activityHandoff` selector → `file` / `coverSrc` / `paused` memos for `mini-owned` → `ActivityIsland` subscribes via `useCurrentActivity()`. `syncActivityHandoff` only patches `activityHandoff` when `activityOwner === surface`; no owner change needed.

**Video pop-out seek (B):** `applyMiniHandoff` defers `resumeSeekAppliedPathRef` until `duration > 0`; `applyInitialMediaSeek` re-applies handoff time on `loadedmetadata` if first seek ran too early.

**`clearActivityHandoff` contract** (`ruforgeStore.ts`):

```ts
clearActivityHandoff: () => {
  set({ activityOwner: null, activityHandoff: null });
},
```

---

## Review focus (for Claude)

1. **Provider boundary:** `MainPlaybackHost` wraps full shell in `App.tsx` before `navMode` fork. `MusicShell` unmounts off music mode but host stays. Any new `useMainAudioPlayback()` call sites must stay under host.
2. **Bridge ownership races:** Host vs `PlayerView` video bridge; audio on player tab should not double-publish.
3. **Island live vs frozen:** `useCurrentActivity` must not add `playbackStorage` fallback for `main-music` (only `main-video` may use `readFurthestPlaybackSec`).
4. **`handlePopOutMusic` ordering:** ready listener registered before `open_music_mini_player` on cold open; in-flight guard on double click.
5. **`setPlayingFile` claim path:** all play entry points route through `claimMainPlayback()` (both minis). Grep for direct `playingFile` sets bypassing claim.
6. **Mini teardown:** `activity-mini-teardown` clears handoff only when `activityOwner === payload.surface`; double emit on close is idempotent.
7. **HMR false positives:** `useMainAudioPlayback` throw after hot reload is often HMR, not a real boundary bug. Reproduce on cold boot.

---

## Explicitly out of scope (this pass)

- Phase C: persistent `<video>` off player tab.
- Changing `main-video` island to live bridge.
- D exclusivity matrix: Angel cold boot (see checklist above).
- UI polish (Jim pass).
- Release / version bump.

---

## Commands

```powershell
npm run build          # tsc + vite
npm test               # vitest (includes activityIslandResolve)
npm run tauri dev      # cold dev; port 1420
```

---

## Agent rules (short)

- Read/update `STATE.md` after behavior changes; append `AGENTS.md` Shipped log.
- No em dashes in repo-facing text.
- Surgical edits only; no patch scripts.
- Logic agent (Chad) only; visual polish is Jim handoff.
- Do not commit unless Angel asks.

---

## Open questions / known noise

- `[TAURI] Couldn't find callback id` after HMR reload: dev noise, not production.
- `music_listen_transfer on adopt failed`: mitigated by fallthrough to fresh session; may still log on edge reload cases.
- **Intermittent double-click** (mini pop-out, subtitle menus, other controls): open P1, not fixed this pass. Suspect in-flight guards, overlay `pointer-events`, or WebView2 focus timing. Needs dedicated repro pass.
- **Island pill/card layout** off top of screen: Jim pass before animation/cover-extract polish.
- **Mini-owned live waveform** (progress sync from mini): stub uses frozen `activityHandoff` snapshot; bars animate from handoff `paused` only, not live mini playback.
- D-audio matrix: 1,2,4,6,7 signed off; re-cold-boot **#5** (island metadata on swap) and **B seek** after handoff-sync + seek fix.
- E-audio checks 2-5: Angel signed off except island layout.

---

*Generated 2026-06-13 for continuation review. Update this file if phase status or verification changes.*
