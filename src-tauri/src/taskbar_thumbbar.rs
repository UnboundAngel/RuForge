#![cfg(windows)]

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewWindow};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Controls::ImageList_Destroy;
use windows::Win32::UI::Shell::{
    DefSubclassProc, ITaskbarList3, RemoveWindowSubclass, SetWindowSubclass, TaskbarList,
    THBF_DISABLED, THBF_ENABLED, THB_BITMAP, THB_FLAGS, THB_TOOLTIP,
    THBN_CLICKED, THUMBBUTTON, THUMBBUTTONMASK,
};
use windows::Win32::UI::WindowsAndMessaging::{
    ChangeWindowMessageFilterEx, GetSystemMetrics, MSGFLT_ALLOW, RegisterWindowMessageW,
    SM_CXICON, SM_CYICON, WM_COMMAND, WM_USER,
};

use crate::taskbar_thumbbar_icons::{
    like_bitmap_index, rebuild_transport_image_list, BITMAP_NEXT, BITMAP_PAUSE, BITMAP_PLAY,
    BITMAP_PREV,
};

pub const TASKBAR_TRANSPORT_EVENT: &str = "ruforge:taskbar-transport";
pub const TASKBAR_READY_EVENT: &str = "ruforge:taskbar-ready";

#[derive(Clone, Serialize)]
struct TaskbarTransportPayload {
    action: String,
}

const SUBCLASS_ID: usize = (WM_USER + 0x70) as usize;
const THUMB_ID_LIKE: u32 = 1;
const THUMB_ID_PREV: u32 = 2;
const THUMB_ID_PLAY_PAUSE: u32 = 3;
const THUMB_ID_NEXT: u32 = 4;

static THUMBBAR: OnceLock<Mutex<ThumbbarInner>> = OnceLock::new();
static TASKBAR_BUTTON_CREATED_MSG: AtomicU32 = AtomicU32::new(0);
static COM_INIT: AtomicBool = AtomicBool::new(false);

struct ThumbbarInner {
    app: AppHandle,
    hwnd: isize,
    subclass_attached: bool,
    session_added: bool,
    taskbar_button_created_seen: bool,
    himl: isize,
    himl_valid: bool,
}

impl ThumbbarInner {
    fn hwnd_handle(&self) -> HWND {
        HWND(self.hwnd as *mut _)
    }

    fn himl_handle(&self) -> windows::Win32::UI::Controls::HIMAGELIST {
        windows::Win32::UI::Controls::HIMAGELIST(self.himl)
    }

    fn new(app: AppHandle) -> Self {
        Self {
            app,
            hwnd: 0,
            subclass_attached: false,
            session_added: false,
            taskbar_button_created_seen: false,
            himl: 0,
            himl_valid: false,
        }
    }

    fn ensure_com_apartment(&self) {
        if COM_INIT.swap(true, Ordering::SeqCst) {
            return;
        }
        // STA matches the Win32 UI thread that owns the Tauri main HWND.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        }
    }

    fn register_taskbar_message(&self) {
        if TASKBAR_BUTTON_CREATED_MSG.load(Ordering::Acquire) != 0 {
            return;
        }
        let wide: Vec<u16> = "TaskbarButtonCreated"
            .encode_utf16()
            .chain([0])
            .collect();
        let msg = unsafe { RegisterWindowMessageW(PCWSTR::from_raw(wide.as_ptr())) };
        TASKBAR_BUTTON_CREATED_MSG.store(msg, Ordering::Release);
    }

    fn rebuild_image_list(&mut self) -> Result<(), String> {
        unsafe {
            if self.himl_valid {
                let _ = ImageList_Destroy(Some(self.himl_handle()));
                self.himl_valid = false;
            }

            let cx = GetSystemMetrics(SM_CXICON);
            let cy = GetSystemMetrics(SM_CYICON);
            let himl = rebuild_transport_image_list(cx, cy)?;
            self.himl = himl.0;
            self.himl_valid = true;
        }
        Ok(())
    }

    fn ensure_thumbbar_buttons(&mut self, hwnd: HWND, _init_source: &str) -> Result<(), String> {
        if self.session_added {
            return Ok(());
        }

        self.ensure_com_apartment();
        self.rebuild_image_list()?;

        unsafe {
            let taskbar: ITaskbarList3 =
                CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("CoCreateInstance TaskbarList: {e}"))?;

            taskbar
                .HrInit()
                .map_err(|e| format!("ITaskbarList3::HrInit: {e}"))?;

            taskbar
                .ThumbBarSetImageList(hwnd, self.himl_handle())
                .map_err(|e| format!("ThumbBarSetImageList: {e}"))?;

            let mut buttons = default_buttons();
            apply_button_state(
                &mut buttons,
                &SyncTaskbarTransportArgs {
                    active: false,
                    paused: true,
                    has_prev: false,
                    has_next: false,
                    like_available: false,
                    liked: false,
                    like_anim_frame: None,
                    like_anim_frames: None,
                },
            );
            bootstrap_transport_interactive(&mut buttons);

            taskbar
                .ThumbBarAddButtons(hwnd, &buttons)
                .map_err(|e| format!("ThumbBarAddButtons: {e}"))?;
        }

        self.session_added = true;
        self.hwnd = hwnd.0 as isize;
        self.emit_taskbar_ready();

        Ok(())
    }

    fn emit_taskbar_ready(&self) {
        let app = self.app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            let _ = app.emit_to(
                EventTarget::webview_window("main"),
                TASKBAR_READY_EVENT,
                (),
            );
        });
    }

    fn update_buttons(&mut self, args: &SyncTaskbarTransportArgs) -> Result<(), String> {
        if !self.session_added || self.hwnd == 0 {
            return Ok(());
        }

        let hwnd = self.hwnd_handle();
        self.ensure_com_apartment();

        let mut buttons = default_buttons();
        apply_button_state(&mut buttons, args);

        unsafe {
            let taskbar: ITaskbarList3 =
                CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER)
                    .map_err(|e| format!("CoCreateInstance TaskbarList: {e}"))?;
            taskbar
                .HrInit()
                .map_err(|e| format!("ITaskbarList3::HrInit: {e}"))?;
            taskbar
                .ThumbBarUpdateButtons(hwnd, &buttons)
                .map_err(|e| format!("ThumbBarUpdateButtons: {e}"))?;
        }

        Ok(())
    }

    fn on_taskbar_button_created(&mut self, hwnd: HWND) {
        self.taskbar_button_created_seen = true;
        // Explorer restart delivers TaskbarButtonCreated again; session latch resets so we re-add.
        self.session_added = false;
        if let Err(e) = self.ensure_thumbbar_buttons(hwnd, "taskbar_button_created") {
            crate::rf_log!(
                "core.platform",
                log::Level::Warn,
                "taskbar thumbbar re-add failed: {e}"
            );
        }
    }

    fn emit_transport(&self, action: &'static str) {
        let app = self.app.clone();
        let payload = TaskbarTransportPayload {
            action: action.to_string(),
        };
        let _ = app.clone().run_on_main_thread(move || {
            let _ = app.emit_to(
                EventTarget::webview_window("main"),
                TASKBAR_TRANSPORT_EVENT,
                payload,
            );
        });
    }

    fn teardown(&mut self) {
        if self.subclass_attached && self.hwnd != 0 {
            let hwnd = self.hwnd_handle();
            unsafe {
                let _ = RemoveWindowSubclass(
                    hwnd,
                    Some(thumbbar_subclass_proc),
                    SUBCLASS_ID,
                );
            }
            self.subclass_attached = false;
        }

        if self.himl_valid {
            unsafe {
                let _ = ImageList_Destroy(Some(self.himl_handle()));
            }
            self.himl_valid = false;
        }

        self.session_added = false;
        self.taskbar_button_created_seen = false;
        self.hwnd = 0;
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncTaskbarTransportArgs {
    pub active: bool,
    pub paused: bool,
    pub has_prev: bool,
    pub has_next: bool,
    pub like_available: bool,
    pub liked: bool,
    pub like_anim_frame: Option<u8>,
    pub like_anim_frames: Option<u8>,
}

#[tauri::command]
pub fn sync_taskbar_transport(
    active: bool,
    paused: bool,
    has_prev: bool,
    has_next: bool,
    like_available: bool,
    liked: bool,
    like_anim_frame: Option<u8>,
    like_anim_frames: Option<u8>,
) -> Result<(), String> {
    let args = SyncTaskbarTransportArgs {
        active,
        paused,
        has_prev,
        has_next,
        like_available,
        liked,
        like_anim_frame,
        like_anim_frames,
    };
    let lock = THUMBBAR.get().ok_or("taskbar thumbbar not initialized")?;
    let mut inner = lock.lock().map_err(|_| "taskbar thumbbar lock poisoned")?;
    inner.update_buttons(&args)
}

pub fn attach_to_main(app: &tauri::App) {
    let Some(main) = app.get_webview_window("main") else {
        crate::rf_log!(
            "core.platform",
            log::Level::Warn,
            "taskbar thumbbar: main webview missing at setup"
        );
        return;
    };

    let app_handle = app.handle().clone();
    THUMBBAR.get_or_init(|| Mutex::new(ThumbbarInner::new(app_handle)));

    if let Ok(lock) = THUMBBAR.get().unwrap().lock() {
        lock.register_taskbar_message();
    }

    let main_for_events = main.clone();
    main.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Focused(true) => {
                try_attach_subclass(&main_for_events);
                emit_taskbar_ready_if_registered();
            }
            tauri::WindowEvent::Resized(_) => {
                try_attach_subclass(&main_for_events);
            }
            tauri::WindowEvent::Destroyed => {
                on_main_destroyed();
            }
            _ => {}
        }
    });

    try_attach_subclass(&main);
}

pub fn on_main_destroyed() {
    if let Some(lock) = THUMBBAR.get() {
        if let Ok(mut inner) = lock.lock() {
            inner.teardown();
        }
    }
}

fn try_attach_subclass(main: &WebviewWindow) {
    let hwnd = match main.hwnd() {
        Ok(h) => h,
        Err(e) => {
            crate::rf_log!(
                "core.platform",
                log::Level::Debug,
                "taskbar thumbbar: hwnd not ready yet ({e})"
            );
            return;
        }
    };

    let lock = THUMBBAR.get_or_init(|| {
        Mutex::new(ThumbbarInner::new(main.app_handle().clone()))
    });

    let mut inner = match lock.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    inner.register_taskbar_message();
    inner.ensure_com_apartment();

    if !inner.subclass_attached {
        unsafe {
            allow_thumbbar_messages(hwnd);
            let ok = SetWindowSubclass(hwnd, Some(thumbbar_subclass_proc), SUBCLASS_ID, 0);
            if !ok.as_bool() {
                crate::rf_log!(
                    "core.platform",
                    log::Level::Warn,
                    "taskbar thumbbar: SetWindowSubclass failed"
                );
                return;
            }
        }
        inner.subclass_attached = true;
        inner.hwnd = hwnd.0 as isize;
    }

    if !inner.session_added {
        let init_source = if inner.taskbar_button_created_seen {
            "post_tbc"
        } else {
            "eager_attach"
        };
        if let Err(e) = inner.ensure_thumbbar_buttons(hwnd, init_source) {
            crate::rf_log!(
                "core.platform",
                log::Level::Debug,
                "taskbar thumbbar: add deferred ({e})"
            );
        }
    }
}

fn emit_taskbar_ready_if_registered() {
    let Some(lock) = THUMBBAR.get() else {
        return;
    };
    if let Ok(inner) = lock.lock() {
        if inner.session_added {
            inner.emit_taskbar_ready();
        }
    }
}

fn bootstrap_transport_interactive(buttons: &mut [THUMBBUTTON; 4]) {
    for btn in buttons.iter_mut() {
        match btn.iId {
            THUMB_ID_PREV | THUMB_ID_PLAY_PAUSE | THUMB_ID_NEXT => {
                btn.dwFlags = THBF_ENABLED;
            }
            _ => {}
        }
    }
}

unsafe extern "system" fn thumbbar_subclass_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    let created_msg = TASKBAR_BUTTON_CREATED_MSG.load(Ordering::Acquire);
    if created_msg != 0 && msg == created_msg {
        if let Some(lock) = THUMBBAR.get() {
            if let Ok(mut inner) = lock.lock() {
                inner.on_taskbar_button_created(hwnd);
            }
        }
    }

    if msg == WM_COMMAND {
        if let Some(action) = thumbbar_action_for_command(wparam) {
            if let Some(lock) = THUMBBAR.get() {
                if let Ok(inner) = lock.lock() {
                    inner.emit_transport(action);
                }
            }
            return LRESULT(0);
        }
    }

    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

unsafe fn allow_thumbbar_messages(hwnd: HWND) {
    let created_msg = TASKBAR_BUTTON_CREATED_MSG.load(Ordering::Acquire);
    let _ = ChangeWindowMessageFilterEx(hwnd, WM_COMMAND, MSGFLT_ALLOW, None);
    if created_msg != 0 {
        let _ = ChangeWindowMessageFilterEx(hwnd, created_msg, MSGFLT_ALLOW, None);
    }
}

fn thumbbar_action_for_command(wparam: WPARAM) -> Option<&'static str> {
    let cmd = wparam.0 as u32 & 0xFFFF;
    let notify = (wparam.0 as u32) >> 16;
    // Explorer may send THBN_CLICKED in HIWORD; the MS sample only checks LOWORD button id.
    let from_thumbbar = notify == THBN_CLICKED || notify == 0;
    if !from_thumbbar {
        return None;
    }

    match cmd {
        THUMB_ID_LIKE => Some("like"),
        THUMB_ID_PREV => Some("prev"),
        THUMB_ID_PLAY_PAUSE => Some("play_pause"),
        THUMB_ID_NEXT => Some("next"),
        _ => None,
    }
}

fn default_buttons() -> [THUMBBUTTON; 4] {
    let mask = THUMBBUTTONMASK(THB_BITMAP.0 | THB_TOOLTIP.0 | THB_FLAGS.0);

    let mut like = THUMBBUTTON::default();
    like.dwMask = mask;
    like.iId = THUMB_ID_LIKE;
    set_tip(&mut like, "Like");

    let mut prev = THUMBBUTTON::default();
    prev.dwMask = mask;
    prev.iId = THUMB_ID_PREV;
    prev.iBitmap = BITMAP_PREV;
    set_tip(&mut prev, "Previous");

    let mut play_pause = THUMBBUTTON::default();
    play_pause.dwMask = mask;
    play_pause.iId = THUMB_ID_PLAY_PAUSE;
    play_pause.iBitmap = BITMAP_PLAY;
    set_tip(&mut play_pause, "Play");

    let mut next = THUMBBUTTON::default();
    next.dwMask = mask;
    next.iId = THUMB_ID_NEXT;
    next.iBitmap = BITMAP_NEXT;
    set_tip(&mut next, "Next");

    [like, prev, play_pause, next]
}

fn apply_button_state(buttons: &mut [THUMBBUTTON; 4], args: &SyncTaskbarTransportArgs) {
    let like_idx = like_bitmap_index(
        args.liked,
        args.like_anim_frame,
        args.like_anim_frames,
    );
    buttons[0].iBitmap = like_idx;
    buttons[0].dwFlags = if args.like_available {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };
    set_tip(
        &mut buttons[0],
        if args.liked { "Liked" } else { "Like" },
    );

    buttons[1].dwFlags = if args.active && args.has_prev {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };

    buttons[2].iBitmap = if args.paused { BITMAP_PLAY } else { BITMAP_PAUSE };
    buttons[2].dwFlags = if args.active {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };
    set_tip(
        &mut buttons[2],
        if args.paused { "Play" } else { "Pause" },
    );

    buttons[3].dwFlags = if args.active && args.has_next {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };
}

fn set_tip(button: &mut THUMBBUTTON, tip: &str) {
    let wide: Vec<u16> = tip.encode_utf16().collect();
    for (i, ch) in wide.iter().take(259).enumerate() {
        button.szTip[i] = *ch;
    }
    if wide.len() < 260 {
        button.szTip[wide.len()] = 0;
    }
}
