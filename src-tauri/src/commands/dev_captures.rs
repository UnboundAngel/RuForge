use std::path::{Path, PathBuf};

use drag::{DragItem, Image, Options};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const CAPTURES_SUBDIR: &str = "dev-captures";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevCaptureEntry {
    pub path: String,
    pub name: String,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevCaptureScreenshotResult {
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub modified_ms: u64,
}

fn sanitize_context_label(raw: &str) -> String {
    let mut out = String::new();
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch.to_ascii_lowercase());
        } else if ch.is_whitespace() || ch == '/' {
            if !out.ends_with('_') && !out.is_empty() {
                out.push('_');
            }
        }
    }
    let trimmed = out.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "screen".to_string()
    } else {
        trimmed
    }
}

pub fn dev_captures_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join(CAPTURES_SUBDIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_png_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("png"))
}

fn path_under_captures_dir(captures_dir: &Path, path: &str) -> Result<PathBuf, String> {
    let canonical_dir = std::fs::canonicalize(captures_dir).map_err(|e| e.to_string())?;
    let candidate = PathBuf::from(path);
    let canonical = std::fs::canonicalize(&candidate).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("path is outside dev-captures".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn dev_captures_folder_path(app: AppHandle) -> Result<String, String> {
    Ok(dev_captures_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_dev_captures(app: AppHandle) -> Result<Vec<DevCaptureEntry>, String> {
    let dir = dev_captures_dir(&app)?;
    let mut entries: Vec<DevCaptureEntry> = Vec::new();

    let read_dir = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_file() || !is_png_file(&path) {
            continue;
        }
        let modified_ms = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("capture.png")
            .to_string();
        entries.push(DevCaptureEntry {
            path: path.to_string_lossy().into_owned(),
            name,
            modified_ms,
        });
    }

    entries.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(entries)
}

#[tauri::command]
pub fn read_dev_capture_png(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    let dir = dev_captures_dir(&app)?;
    let file = path_under_captures_dir(&dir, &path)?;
    if !is_png_file(&file) {
        return Err("only png files are allowed".to_string());
    }
    std::fs::read(&file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_dev_capture_png(app: AppHandle, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let dir = dev_captures_dir(&app)?;
    let file = path_under_captures_dir(&dir, &path)?;
    if !is_png_file(&file) {
        return Err("only png files are allowed".to_string());
    }
    std::fs::write(&file, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_dev_captures(app: AppHandle, paths: Vec<String>) -> Result<u32, String> {
    let dir = dev_captures_dir(&app)?;
    let mut removed: u32 = 0;
    for path in paths {
        let file = path_under_captures_dir(&dir, &path)?;
        if file.is_file() {
            std::fs::remove_file(&file).map_err(|e| e.to_string())?;
            removed = removed.saturating_add(1);
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn start_dev_capture_file_drag(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    if paths.is_empty() {
        return Err("no files to drag".to_string());
    }

    let dir = dev_captures_dir(&app)?;
    let mut files: Vec<PathBuf> = Vec::new();
    for path in paths {
        let file = path_under_captures_dir(&dir, &path)?;
        if file.is_file() {
            files.push(file);
        }
    }
    if files.is_empty() {
        return Err("no valid capture files".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        let _ = files;
        return Err("file drag-out is not wired on linux".to_string());
    }

    #[cfg(not(target_os = "linux"))]
    {
        let icon_path = files[0].clone();
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;

        drag::start_drag(
            &window,
            DragItem::Files(files),
            Image::File(icon_path),
            |_result, _pos| {},
            Options::default(),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(windows)]
mod native_capture {
    use std::path::Path;

    use tauri::{AppHandle, Manager};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
        SRCCOPY,
    };

    use super::{dev_captures_dir, DevCaptureScreenshotResult, sanitize_context_label};

    fn capture_screen_region(hwnd: HWND) -> Result<(u32, u32, Vec<u8>), String> {
        unsafe {
            let mut rect = RECT::default();
            windows::Win32::UI::WindowsAndMessaging::GetWindowRect(hwnd, &mut rect)
                .map_err(|e| e.to_string())?;

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            if width <= 0 || height <= 0 {
                return Err("window has zero size".to_string());
            }

            let hdc_screen = GetDC(None);
            if hdc_screen.0.is_null() {
                return Err("GetDC failed".to_string());
            }

            let hdc_mem = CreateCompatibleDC(Some(hdc_screen));
            if hdc_mem.0.is_null() {
                let _ = ReleaseDC(None, hdc_screen);
                return Err("CreateCompatibleDC failed".to_string());
            }

            let hbm = CreateCompatibleBitmap(hdc_screen, width, height);
            if hbm.0.is_null() {
                let _ = DeleteDC(hdc_mem);
                let _ = ReleaseDC(None, hdc_screen);
                return Err("CreateCompatibleBitmap failed".to_string());
            }

            let old_obj = SelectObject(hdc_mem, HGDIOBJ(hbm.0));
            BitBlt(
                hdc_mem,
                0,
                0,
                width,
                height,
                Some(hdc_screen),
                rect.left,
                rect.top,
                SRCCOPY,
            )
            .map_err(|e| {
                let _ = SelectObject(hdc_mem, old_obj);
                let _ = DeleteObject(hbm.into());
                let _ = DeleteDC(hdc_mem);
                let _ = ReleaseDC(None, hdc_screen);
                e.to_string()
            })?;

            let w = width as u32;
            let h = height as u32;
            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };

            let mut pixels = vec![0u8; (w * h * 4) as usize];
            let lines = GetDIBits(
                hdc_mem,
                hbm,
                0,
                h as u32,
                Some(pixels.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            let _ = SelectObject(hdc_mem, old_obj);
            let _ = DeleteObject(hbm.into());
            let _ = DeleteDC(hdc_mem);
            let _ = ReleaseDC(None, hdc_screen);

            if lines == 0 {
                return Err("GetDIBits failed".to_string());
            }

            Ok((w, h, pixels))
        }
    }

    fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
        let mut rgba = Vec::with_capacity(bgra.len());
        for chunk in bgra.chunks_exact(4) {
            rgba.push(chunk[2]);
            rgba.push(chunk[1]);
            rgba.push(chunk[0]);
            rgba.push(chunk[3]);
        }
        rgba
    }

    fn write_png_rgba(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
        let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
        let mut encoder = png::Encoder::new(file, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn capture_main_window_dev(
        app: AppHandle,
        context_label: String,
    ) -> Result<DevCaptureScreenshotResult, String> {
        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "main window not found".to_string())?;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;

        let (width, height, bgra) = capture_screen_region(hwnd)?;
        let rgba = bgra_to_rgba(&bgra);

        let dir = dev_captures_dir(&app)?;
        let context = sanitize_context_label(&context_label);
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let name = format!("capture_{context}_{stamp}.png");
        let path = dir.join(&name);
        write_png_rgba(&path, width, height, &rgba)?;

        let modified_ms = std::fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(DevCaptureScreenshotResult {
            path: path.to_string_lossy().into_owned(),
            name,
            width,
            height,
            modified_ms,
        })
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn capture_main_window_dev(
    app: AppHandle,
    context_label: String,
) -> Result<DevCaptureScreenshotResult, String> {
    native_capture::capture_main_window_dev(app, context_label)
}

#[cfg(not(windows))]
#[tauri::command]
pub fn capture_main_window_dev(
    _app: AppHandle,
    _context_label: String,
) -> Result<DevCaptureScreenshotResult, String> {
    Err("native dev capture is windows-only".to_string())
}
