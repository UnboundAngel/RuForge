# Recording mode cursors

Cursor shapes for Settings > Debugging > Recording mode, from the macOS cursor theme
[ful1e5/apple_cursor](https://github.com/ful1e5/apple_cursor) (GPL-3.0, same license as RuForge).
Sources are its `svg/` files, recolored the way the theme's own `render.json` builds the "macOS"
variant (`#00FF00` to `#000000`, `#0000FF` to `#FFFFFF`).

| File | Theme source | CSS cursor |
| --- | --- | --- |
| default.svg | left_ptr | default, auto |
| pointer.svg | hand2 | pointer |
| text.svg | xterm | text |
| grab.svg | hand1 | grab |
| grabbing.svg | move | grabbing (the theme's closed hand) |
| not-allowed.svg | crossed_circle | not-allowed |
| no-drop.svg | dnd_no_drop | no-drop |
| all-scroll.svg | all-scroll | move, all-scroll |
| ew-resize.svg | sb_h_double_arrow | col-resize, ew-resize |
| ns-resize.svg | sb_v_double_arrow | row-resize, ns-resize |
| nesw-resize.svg | bottom_left_corner | nesw-resize |
| nwse-resize.svg | bottom_right_corner | nwse-resize |
| crosshair.svg | crosshair | crosshair |

Hotspots (in the 256 unit artboard) live in `src/components/recording-mode/cursorShapes.ts`,
copied from the theme's `configs/x.build.toml`; shapes it lists no hotspot for use the centre (128, 128).

The theme is licensed GPL-3.0; see https://github.com/ful1e5/apple_cursor/blob/main/LICENSE.
