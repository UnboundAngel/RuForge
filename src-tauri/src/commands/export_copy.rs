//! Fast path-aware file copy for export bundles.
//!
//! Windows: `CopyFileExW` (kernel copy; progress routine always registered).
//!   Cancel: `cancel_export_bundle` sets `ExportBundleState.cancel`; the routine reads it and
//!   returns `PROGRESS_CANCEL` (partial dest file removed by the OS). Same `Arc<AtomicBool>` is
//!   passed on every copy, including sidecars.
//!   Progress: video copies pass a `CopyProgressSink` -> `video_copy_bytes_cb` in `export.rs`
//!   -> `emit_progress` -> `export-bundle-progress` event. Sidecar copies omit the sink (cancel only).
//! Linux: `copy_file_range` in 16 MiB chunks when same volume; 8 MiB buffered fallback cross-volume.
//! Other Unix (macOS): `std::fs::copy` when progress not needed; 8 MiB buffered when it is.

#[cfg(not(windows))]
use std::fs::File;
#[cfg(not(windows))]
use std::io::{self, Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(not(windows))]
/// 8 MiB, same order of magnitude as `std::io::copy` in the Rust standard library.
const IO_COPY_BUF_BYTES: usize = 8 * 1024 * 1024;

#[cfg(target_os = "linux")]
const COPY_FILE_RANGE_CHUNK: usize = 16 * 1024 * 1024;

/// Progress hook for copies that report byte counts (`transferred`, `total`).
pub type CopyBytesFn = unsafe fn(transferred: u64, total: u64, userdata: *mut ());

#[derive(Clone, Copy)]
pub struct CopyProgressSink {
    pub on_bytes: CopyBytesFn,
    pub userdata: *mut (),
}

pub struct FastCopyOptions<'a> {
    pub cancel: &'a AtomicBool,
    pub progress: Option<CopyProgressSink>,
    _borrow: core::marker::PhantomData<&'a ()>,
}

impl<'a> FastCopyOptions<'a> {
    pub fn new(cancel: &'a AtomicBool) -> Self {
        Self {
            cancel,
            progress: None,
            _borrow: core::marker::PhantomData,
        }
    }

    pub fn with_progress(
        cancel: &'a AtomicBool,
        on_bytes: CopyBytesFn,
        userdata: *mut (),
    ) -> Self {
        Self {
            cancel,
            progress: Some(CopyProgressSink {
                on_bytes,
                userdata,
            }),
            _borrow: core::marker::PhantomData,
        }
    }
}

pub fn fast_copy(
    src: &Path,
    dest: &Path,
    opts: FastCopyOptions<'_>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        return windows_copy_file_ex(src, dest, opts);
    }

    #[cfg(not(windows))]
    {
        unix_fast_copy(src, dest, opts)
    }
}

#[cfg(windows)]
fn windows_copy_file_ex(
    src: &Path,
    dest: &Path,
    opts: FastCopyOptions<'_>,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{BOOL, PCWSTR};
    use windows::Win32::Storage::FileSystem::{
        CopyFileExW, COPYFILE_FLAGS, COPYPROGRESSROUTINE_PROGRESS, LPPROGRESS_ROUTINE,
        LPPROGRESS_ROUTINE_CALLBACK_REASON, PROGRESS_CANCEL, PROGRESS_CONTINUE,
    };

    fn path_wide(path: &Path) -> Result<Vec<u16>, String> {
        Ok(path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect())
    }

    struct CopyExCtx<'a> {
        cancel: &'a AtomicBool,
        progress: Option<CopyProgressSink>,
        _borrow: core::marker::PhantomData<&'a ()>,
    }

    /// Called on the same thread as `CopyFileExW` while the kernel copies.
    /// Checks `ExportBundleState.cancel` and forwards byte counts to `export.rs` when a sink is set.
    unsafe extern "system" fn progress_routine(
        total_file_size: i64,
        total_bytes_transferred: i64,
        _stream_size: i64,
        _stream_bytes_transferred: i64,
        _stream_number: u32,
        _callback_reason: LPPROGRESS_ROUTINE_CALLBACK_REASON,
        _h_source: windows::Win32::Foundation::HANDLE,
        _h_dest: windows::Win32::Foundation::HANDLE,
        lp_data: *const core::ffi::c_void,
    ) -> COPYPROGRESSROUTINE_PROGRESS {
        if lp_data.is_null() {
            return PROGRESS_CONTINUE;
        }
        let ctx = &*(lp_data as *const CopyExCtx<'_>);
        if ctx.cancel.load(Ordering::SeqCst) {
            return PROGRESS_CANCEL;
        }
        if let Some(sink) = ctx.progress {
            let total = total_file_size.max(0) as u64;
            let done = total_bytes_transferred.max(0) as u64;
            (sink.on_bytes)(done, total, sink.userdata);
        }
        PROGRESS_CONTINUE
    }

    let src_wide = path_wide(src)?;
    let dest_wide = path_wide(dest)?;

    let mut cancel_flag = BOOL(0);
    let ctx = CopyExCtx {
        cancel: opts.cancel,
        progress: opts.progress,
        _borrow: core::marker::PhantomData,
    };

    // Always register the routine so `cancel_export_bundle` can stop an in-flight
    // kernel copy (sidecars included). Byte reporting only runs when `progress` is Some.
    let routine: LPPROGRESS_ROUTINE = Some(progress_routine);

    unsafe {
        CopyFileExW(
            PCWSTR(src_wide.as_ptr()),
            PCWSTR(dest_wide.as_ptr()),
            routine,
            Some(&ctx as *const _ as *const core::ffi::c_void),
            Some(&mut cancel_flag),
            COPYFILE_FLAGS(0),
        )
        .map_err(|e| windows_copy_error(src, dest, e))?;
    }

    if opts.cancel.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(dest);
        return Err("Export cancelled.".into());
    }

    Ok(())
}

#[cfg(windows)]
fn windows_copy_error(
    src: &Path,
    dest: &Path,
    e: windows::core::Error,
) -> String {
    let code = e.code().0 as u32;
    if code == windows::Win32::Foundation::ERROR_REQUEST_ABORTED.0 {
        let _ = std::fs::remove_file(dest);
        return "Export cancelled.".into();
    }
    if code == 112 {
        return format!("Disk full copying {} -> {}", src.display(), dest.display());
    }
    format!("Copy {} -> {}: {e}", src.display(), dest.display())
}

pub fn is_export_cancelled_err(err: &str) -> bool {
    err == "Export cancelled."
}

#[cfg(not(windows))]
const CROSS_DEVICE_FALLBACK: &str = "__export_copy_cross_device__";

#[cfg(not(windows))]
fn unix_fast_copy(
    src: &Path,
    dest: &Path,
    opts: FastCopyOptions<'_>,
) -> Result<(), String> {
    if opts.progress.is_none() {
        std::fs::copy(src, dest).map_err(|e| io_err(src, dest, e))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    match linux_copy_file_range(src, dest, &opts) {
        Ok(()) => return Ok(()),
        Err(ref e) if e == CROSS_DEVICE_FALLBACK => {}
        Err(e) => return Err(e),
    }

    buffered_copy_with_progress(src, dest, &opts)
}

#[cfg(target_os = "linux")]
fn linux_copy_file_range(
    src: &Path,
    dest: &Path,
    opts: &FastCopyOptions<'_>,
) -> Result<(), String> {
    use std::os::unix::fs::copy_file_range;

    let src_f = File::open(src).map_err(|e| io_err(src, dest, e))?;
    let dest_f = File::create(dest).map_err(|e| {
        let _ = std::fs::remove_file(dest);
        io_err(src, dest, e)
    })?;
    let len = src_f.metadata().map_err(|e| io_err(src, dest, e))?.len();

    let mut src_off: i64 = 0;
    let mut dest_off: i64 = 0;
    let mut transferred: u64 = 0;
    let mut last_pct: Option<u64> = None;

    while transferred < len {
        if opts.cancel.load(Ordering::SeqCst) {
            drop(dest_f);
            let _ = std::fs::remove_file(dest);
            return Err("Export cancelled.".into());
        }

        let remain = (len - transferred) as usize;
        let chunk = remain.min(COPY_FILE_RANGE_CHUNK);

        match copy_file_range(
            &src_f,
            Some(&mut src_off),
            &dest_f,
            Some(&mut dest_off),
            chunk,
        ) {
            Ok(0) => {
                let _ = std::fs::remove_file(dest);
                return Err(CROSS_DEVICE_FALLBACK.into());
            }
            Ok(n) => {
                transferred = transferred.saturating_add(n as u64);
                emit_bytes(opts, len, transferred, &mut last_pct);
            }
            Err(e) if e.kind() == io::ErrorKind::CrossesDevices => {
                let _ = std::fs::remove_file(dest);
                return Err(CROSS_DEVICE_FALLBACK.into());
            }
            Err(e) => return Err(io_err(src, dest, e)),
        }
    }

    Ok(())
}

#[cfg(not(windows))]
fn buffered_copy_with_progress(
    src: &Path,
    dest: &Path,
    opts: &FastCopyOptions<'_>,
) -> Result<(), String> {
    let mut src_f = File::open(src).map_err(|e| io_err(src, dest, e))?;
    let mut dest_f = File::create(dest).map_err(|e| {
        let _ = std::fs::remove_file(dest);
        io_err(src, dest, e)
    })?;
    let len = src_f.metadata().map_err(|e| io_err(src, dest, e))?.len();

    let mut buf = vec![0u8; IO_COPY_BUF_BYTES];
    let mut transferred: u64 = 0;
    let mut last_pct: Option<u64> = None;

    loop {
        if opts.cancel.load(Ordering::SeqCst) {
            drop(dest_f);
            let _ = std::fs::remove_file(dest);
            return Err("Export cancelled.".into());
        }

        let n = src_f.read(&mut buf).map_err(|e| io_err(src, dest, e))?;
        if n == 0 {
            break;
        }
        dest_f
            .write_all(&buf[..n])
            .map_err(|e| io_err(src, dest, e))?;
        transferred = transferred.saturating_add(n as u64);
        emit_bytes(opts, len, transferred, &mut last_pct);
    }

    Ok(())
}

#[cfg(not(windows))]
fn emit_bytes(
    opts: &FastCopyOptions<'_>,
    total: u64,
    transferred: u64,
    last_pct: &mut Option<u64>,
) {
    let Some(sink) = opts.progress else {
        return;
    };
    let pct = if total > 0 {
        (transferred * 100) / total
    } else {
        0
    };
    if *last_pct == Some(pct) {
        return;
    }
    *last_pct = Some(pct);
    unsafe {
        (sink.on_bytes)(transferred, total, sink.userdata);
    }
}

#[cfg(not(windows))]
fn io_err(src: &Path, dest: &Path, e: io::Error) -> String {
    if e.kind() == io::ErrorKind::StorageFull {
        return format!("Disk full copying {} -> {}", src.display(), dest.display());
    }
    format!("Copy {} -> {}: {e}", src.display(), dest.display())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_cancelled_err_is_recognized() {
        assert!(is_export_cancelled_err("Export cancelled."));
        assert!(!is_export_cancelled_err("disk full"));
    }
}
