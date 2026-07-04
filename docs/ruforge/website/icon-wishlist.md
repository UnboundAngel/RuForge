# Icon wishlist (optional)

The site already ships with inline SVG icons and `public/ruforge-logo.png` (copied from `public/neotubeIcon.png`). You do not need to source more icons unless you want branded or multi-color assets.

## Already wired (inline SVG in `src/components/Icon.astro`)

| Name | Used for |
|------|----------|
| `github` | Header download area, footer, changelog GitHub link |
| `download` | Download buttons |
| `message` | Discussions / suggest a feature |
| `shield` | Privacy, legal nav |
| `scale` | Terms |
| `file` | Legal notice |
| `plus` | Changelog additions |
| `wrench` | Changelog fixes |
| `map` | Roadmap |
| `list` | Changelog |
| `check` | Roadmap Finished |
| `circle` | Roadmap To-Do |
| `star` | Roadmap "Extremely important" priority |
| `external` | Outbound links |

## Optional assets (only if you want to replace inline SVGs)

| Asset | Format | Suggested source | Notes |
|-------|--------|------------------|-------|
| RuForge wordmark | SVG or PNG wide | Export from app branding | Header already uses logo + text |
| Windows logo | SVG | Simple Icons / Microsoft brand guidelines | "Windows only" callout on home |
| YouTube (disclaimer) | SVG | Simple Icons | Footer "not affiliated" line |
| Discord | SVG | Simple Icons | If you add a Discord footer link |
| SponsorBlock | SVG | You already have `src/assets/sponsorblock.svg` | Only if a features page mentions it |

## Repo files you can reuse today

- `public/neotubeIcon.png` / `src/assets/neotubeIcon.png` — app icon (site uses `website/public/ruforge-logo.png`)
- `src/assets/sponsorblock.svg` — SponsorBlock mark

Drop any new files into `website/public/icons/` and reference them as `/icons/name.svg` if you prefer image files over inline SVG.

## Tech ticker (home page marquee)

Replace files under `website/public/icons/tech/` to swap brand marks without code changes (except Zustand, which is inline until you add a file and wire it in `TechTickerIcon.astro`).

| File to provide | Label on site | Notes |
|-----------------|---------------|-------|
| `ytdlp.svg` | yt-dlp Engine | Drop into `website/public/icons/tech/` (source: `public/website/Yt-dlp_logo.svg`) |
| `sponsorblock.svg` | SponsorBlock API | Drop into `website/public/icons/tech/` |
| `zustand.svg` | Zustand State Store | Built from `public/website/zustand_bear.svg` (silhouette paths only, ~9 KB). Re-run if you replace the bear source |

Brand image marks are flattened to cream/gray via CSS `filter` so they match Simple Icons. Source files can stay full color.

Already correct via Simple Icons paths in `src/lib/techTickerIcons.ts`: YouTube, Tauri, Rust, React, FFmpeg.
