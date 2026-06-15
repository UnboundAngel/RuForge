#![cfg(windows)]

use windows::Win32::Graphics::Gdi::{
    CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_USAGE, HBITMAP,
};
use windows::Win32::UI::Controls::{ImageList_Add, HIMAGELIST};

const MORPH_FRAMES: usize = 9;

pub const BITMAP_HEART: u32 = 0;
pub const BITMAP_CHECK: u32 = 1;
pub const BITMAP_MORPH_START: u32 = 2;
pub const BITMAP_PREV: u32 = 11;
pub const BITMAP_PLAY: u32 = 12;
pub const BITMAP_PAUSE: u32 = 13;
pub const BITMAP_NEXT: u32 = 14;

pub fn rebuild_transport_image_list(cx: i32, cy: i32) -> Result<HIMAGELIST, String> {
    use windows::Win32::UI::Controls::{
        ImageList_Create, ImageList_Destroy, ILC_COLOR32, IMAGELIST_CREATION_FLAGS,
    };

    unsafe {
        let himl = ImageList_Create(
            cx,
            cy,
            IMAGELIST_CREATION_FLAGS(ILC_COLOR32.0),
            16,
            4,
        );
        if himl.0 == 0 {
            return Err("ImageList_Create failed".into());
        }

        let add = |glyph: Glyph, label: &str| -> Result<i32, String> {
            let hbmp = raster_glyph(cx, cy, glyph)?;
            let idx = ImageList_Add(himl, hbmp, None);
            let _ = DeleteObject(hbmp.into());
            if idx < 0 {
                let _ = ImageList_Destroy(Some(himl));
                return Err(format!("ImageList_Add failed for {label}"));
            }
            Ok(idx)
        };

        add(Glyph::Heart, "heart")?;
        add(Glyph::Check, "check")?;

        for i in 0..MORPH_FRAMES {
            let t = i as f32 / (MORPH_FRAMES - 1) as f32;
            add(Glyph::HeartToCheck(t), &format!("morph_{i}"))?;
        }

        add(Glyph::Prev, "prev")?;
        add(Glyph::Play, "play")?;
        add(Glyph::Pause, "pause")?;
        add(Glyph::Next, "next")?;

        Ok(himl)
    }
}

pub fn like_bitmap_index(liked: bool, anim_frame: Option<u8>, anim_frames: Option<u8>) -> u32 {
    if let (Some(frame), Some(total)) = (anim_frame, anim_frames) {
        if total > 1 {
            let t = frame as f32 / (total - 1) as f32;
            let morph = (t * (MORPH_FRAMES - 1) as f32).round() as u32;
            return BITMAP_MORPH_START + morph.min(MORPH_FRAMES as u32 - 1);
        }
    }
    if liked {
        BITMAP_CHECK
    } else {
        BITMAP_HEART
    }
}

#[derive(Clone, Copy)]
enum Glyph {
    Heart,
    Check,
    HeartToCheck(f32),
    Prev,
    Play,
    Pause,
    Next,
}

fn raster_glyph(cx: i32, cy: i32, glyph: Glyph) -> Result<HBITMAP, String> {
    let mut pixels = vec![0u8; (cx * cy * 4) as usize];
    match glyph {
        Glyph::Heart => draw_heart(&mut pixels, cx, cy, 1.0, 1.0),
        Glyph::Check => draw_check(&mut pixels, cx, cy, 1.0),
        Glyph::HeartToCheck(t) => {
            draw_heart(&mut pixels, cx, cy, 1.0 - t, 1.0 - t);
            draw_check(&mut pixels, cx, cy, t);
        }
        Glyph::Prev => draw_prev(&mut pixels, cx, cy),
        Glyph::Play => draw_play(&mut pixels, cx, cy),
        Glyph::Pause => draw_pause(&mut pixels, cx, cy),
        Glyph::Next => draw_next(&mut pixels, cx, cy),
    }
    create_dib_from_bgra(cx, cy, &pixels)
}

fn blend_pixel(buf: &mut [u8], cx: i32, cy: i32, x: i32, y: i32, r: u8, g: u8, b: u8, a: f32) {
    if x < 0 || y < 0 || x >= cx || y >= cy {
        return;
    }
    let i = ((y * cx + x) * 4) as usize;
    if i + 3 >= buf.len() {
        return;
    }
    let src_a = a.clamp(0.0, 1.0);
    if src_a <= 0.001 {
        return;
    }
    let dst_a = buf[i + 3] as f32 / 255.0;
    let out_a = src_a + dst_a * (1.0 - src_a);
    if out_a <= 0.001 {
        return;
    }
    let blend = |src: u8, dst: u8| {
        let s = src as f32 / 255.0;
        let d = dst as f32 / 255.0;
        ((s * src_a + d * dst_a * (1.0 - src_a)) / out_a * 255.0).round() as u8
    };
    buf[i] = blend(b, buf[i]);
    buf[i + 1] = blend(g, buf[i + 1]);
    buf[i + 2] = blend(r, buf[i + 2]);
    buf[i + 3] = (out_a * 255.0).round() as u8;
}

fn heart_inside(nx: f32, ny: f32) -> bool {
    let x = nx * 1.15;
    let y = -ny * 1.1 + 0.05;
    let a = x * x + y * y - 0.28;
    a * a * a <= x * x * y * y * y + 0.002
}

fn draw_heart(buf: &mut [u8], cx: i32, cy: i32, weight: f32, alpha: f32) {
    if weight <= 0.001 || alpha <= 0.001 {
        return;
    }
    let pad = cx as f32 * 0.22;
    for y in 0..cy {
        for x in 0..cx {
            let nx = ((x as f32 - cx as f32 / 2.0) / (cx as f32 - pad * 2.0)) * 1.05;
            let ny = ((y as f32 - cy as f32 / 2.0) / (cy as f32 - pad * 2.0)) * 1.05;
            if heart_inside(nx, ny) {
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, weight * alpha);
            }
        }
    }
}

fn dist_to_segment(px: f32, py: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    if len2 < 1e-6 {
        return hypot(px - x1, py - y1);
    }
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    let t = t.clamp(0.0, 1.0);
    hypot(px - (x1 + dx * t), py - (y1 + dy * t))
}

fn hypot(x: f32, y: f32) -> f32 {
    (x * x + y * y).sqrt()
}

fn draw_check(buf: &mut [u8], cx: i32, cy: i32, alpha: f32) {
    if alpha <= 0.001 {
        return;
    }
    let w = cx as f32;
    let h = cy as f32;
    let thickness = w * 0.11;
    let p1 = (w * 0.27, h * 0.52);
    let p2 = (w * 0.44, h * 0.68);
    let p3 = (w * 0.74, h * 0.34);
    for y in 0..cy {
        for x in 0..cx {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let d = dist_to_segment(px, py, p1.0, p1.1, p2.0, p2.1)
                .min(dist_to_segment(px, py, p2.0, p2.1, p3.0, p3.1));
            if d <= thickness {
                let edge = 1.0 - (d / thickness).clamp(0.0, 1.0);
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, edge * alpha);
            }
        }
    }
}

fn fill_triangle(buf: &mut [u8], cx: i32, cy: i32, ax: f32, ay: f32, bx: f32, by: f32, cxp: f32, cyp: f32) {
    let min_x = ax.min(bx).min(cxp).floor() as i32;
    let max_x = ax.max(bx).max(cxp).ceil() as i32;
    let min_y = ay.min(by).min(cyp).floor() as i32;
    let max_y = ay.max(by).max(cyp).ceil() as i32;
    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let px = x as f32 + 0.5;
            let py = y as f32 + 0.5;
            let v0x = cxp - ax;
            let v0y = cyp - ay;
            let v1x = bx - ax;
            let v1y = by - ay;
            let v2x = px - ax;
            let v2y = py - ay;
            let dot00 = v0x * v0x + v0y * v0y;
            let dot01 = v0x * v1x + v0y * v1y;
            let dot02 = v0x * v2x + v0y * v2y;
            let dot11 = v1x * v1x + v1y * v1y;
            let dot12 = v1x * v2x + v1y * v2y;
            let inv = 1.0 / (dot00 * dot11 - dot01 * dot01);
            let u = (dot11 * dot02 - dot01 * dot12) * inv;
            let v = (dot00 * dot12 - dot01 * dot02) * inv;
            if u >= 0.0 && v >= 0.0 && (u + v) <= 1.0 {
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, 1.0);
            }
        }
    }
}

fn draw_play(buf: &mut [u8], cx: i32, cy: i32) {
    let w = cx as f32;
    let h = cy as f32;
    fill_triangle(
        buf,
        cx,
        cy,
        w * 0.36,
        h * 0.28,
        w * 0.36,
        h * 0.72,
        w * 0.72,
        h * 0.5,
    );
}

fn draw_pause(buf: &mut [u8], cx: i32, cy: i32) {
    let w = cx as f32;
    let h = cy as f32;
    let bar_w = w * 0.14;
    let gap = w * 0.1;
    let top = h * 0.28;
    let bottom = h * 0.72;
    for y in 0..cy {
        for x in 0..cx {
            let px = x as f32;
            let in_left = px >= w * 0.5 - gap - bar_w && px <= w * 0.5 - gap;
            let in_right = px >= w * 0.5 + gap && px <= w * 0.5 + gap + bar_w;
            let py = y as f32;
            if py >= top && py <= bottom && (in_left || in_right) {
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, 1.0);
            }
        }
    }
}

fn draw_prev(buf: &mut [u8], cx: i32, cy: i32) {
    let w = cx as f32;
    let h = cy as f32;
    fill_triangle(buf, cx, cy, w * 0.58, h * 0.28, w * 0.58, h * 0.72, w * 0.34, h * 0.5);
    for y in 0..cy {
        for x in 0..cx {
            if x as f32 >= w * 0.24 && x as f32 <= w * 0.34 && y as f32 >= h * 0.28 && y as f32 <= h * 0.72 {
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, 1.0);
            }
        }
    }
}

fn draw_next(buf: &mut [u8], cx: i32, cy: i32) {
    let w = cx as f32;
    let h = cy as f32;
    fill_triangle(buf, cx, cy, w * 0.42, h * 0.28, w * 0.42, h * 0.72, w * 0.66, h * 0.5);
    for y in 0..cy {
        for x in 0..cx {
            if x as f32 >= w * 0.66 && x as f32 <= w * 0.76 && y as f32 >= h * 0.28 && y as f32 <= h * 0.72 {
                blend_pixel(buf, cx, cy, x, y, 255, 255, 255, 1.0);
            }
        }
    }
}

fn create_dib_from_bgra(cx: i32, cy: i32, pixels: &[u8]) -> Result<HBITMAP, String> {
    unsafe {
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: cx,
                biHeight: -cy,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let hbmp = CreateDIBSection(
            None,
            &bmi,
            DIB_USAGE(0),
            &mut bits,
            None,
            0,
        )
        .map_err(|e| format!("CreateDIBSection: {e}"))?;
        if bits.is_null() {
            let _ = DeleteObject(hbmp.into());
            return Err("CreateDIBSection null bits".into());
        }
        std::ptr::copy_nonoverlapping(pixels.as_ptr(), bits as *mut u8, pixels.len());
        Ok(hbmp)
    }
}
