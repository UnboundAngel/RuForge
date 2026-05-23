# Download flow sketch frames

## Where you drop art (do not overwrite from agents)

**Your folder (source of truth):** repo root  
`public/website/tutorials/download/`

| Drop file | Maps to app asset |
|-----------|-------------------|
| `downloadStep1.png` | `website/src/assets/tutorials/download/downloadStep1.png` |
| `downloadstep2.png` | `website/src/assets/tutorials/download/downloadStep2.png` |
| `downloadstep3.png` | `website/src/assets/tutorials/download/downloadStep3.png` |

Agents **copy from your folder into `src/assets` only**. They must **never** write back to `public/website/tutorials/download/`.

## Current export (all three)

515 x 749 px, same frame. Step label in the PNG; site overlays title + description only.

## Color themes

| Step | Name | Top | Bottom panel |
|------|------|-----|--------------|
| 01 | Sand | `#c9b89a` | `#ebe4d4` |
| 02 | Wheat | `#e0c992` | `#f0e6c8` |
| 03 | Clay | `#d4a88e` | `#f2ddd0` |

Copy overlay is top-anchored at ~57.5% from frame top in `DownloadTutorialHub.astro`.
