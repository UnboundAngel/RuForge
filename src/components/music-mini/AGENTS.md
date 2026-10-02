# Mini player agent rules

Applies under `src/components/music-mini/` and when editing the video mini (`src/MiniPlayer.tsx`) or other mini-window entrypoints. Root [`AGENTS.md`](../../../AGENTS.md) still applies.

## App.tsx hooks

The mini window runs `App.tsx` hooks too. Guard main-only effects (sync, stores, pollers) on the window label.

## Overlay actions

Validate every action that arrives from the overlay or mini against main's own state before running it.
