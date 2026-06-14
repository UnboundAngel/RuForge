# Deprecated island cover palette extraction

Removed in v0.1.11 (unreleased). Island waveform bars now use blurred cover-art slices in `ActivityIslandWaveform.tsx` instead of canvas pixel extraction.

What was removed from the hot path:

- `extractColorPaletteFromSrc` / `extractColorPaletteFromPath` / `extractColorPaletteFromImageData`
- `stableHueFromLabel`, `monochromeWaveformPalette`, `syntheticWaveformPalette`, `pickColorPalette`
- `accentPalette` threading through `useCurrentActivity` → `ActivityIsland` → `DynamicIsland`
- `src/prominentColor.test.ts` (palette unit tests)

`src/prominentColor.ts` is kept slim for **MiniPlayer** accent CSS sync only (`extractProminentColorFromPath`, `hexIsNearBlackOrWhite`).

If you need the old palette implementation for reference, see git history on this branch before the blur-slice change, or the agent session that introduced monochrome/synthetic palette fallback.
