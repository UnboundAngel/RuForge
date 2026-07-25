/// OBS Window Capture Automatic selects WGC when the class contains Chrome/Mozilla/Edge.
/// Tauri's default "Tauri Window" falls through to BitBlt, which cannot sample WebView2 GPU frames.
pub const OBS_COMPAT_WINDOW_CLASSNAME: &str = "RuForge_Chrome_WidgetWin";
