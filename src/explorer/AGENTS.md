# Explorer agent rules

Applies when working on Explorer webview / title-band chrome. Root [`AGENTS.md`](../../AGENTS.md) still applies. Related files often live beside this folder (`ExplorerTitlebarNav.tsx`, `explorerWebviewLifecycle.ts`, overlay hosts).

## Title band

Explorer actions belong only in the top title band (`h-10`, `z-[100]`), same layer as `WindowControls`: back/forward/reload on the left (`ExplorerTitlebarNav`, `left: 80px` / `240px` with the sidebar), queue / mini / window controls on the right.

Explorer webview is for yt-dlp cookie/session flows, not a casual browser. Child webview paints on top of the main column.

## Media and overlays

Hiding the Explorer does not pause it; `EXPLORER_PAUSE_MEDIA_SCRIPT` does. Never pause the user's Explorer video as a side effect of opening app UI over it. Popovers over web content use the see-through overlay webview pattern (`radialNavOverlayHost.ts`).

## Actions from Explorer

Validate every action that arrives from the Explorer against main's own state before running it.

## Private data

Root AGENTS owns the emit/mailbox rule. Remote pages cannot call app commands.
