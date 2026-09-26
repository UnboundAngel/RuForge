//! Keep playback from being EcoQoS-throttled when the window is visible
//! on a monitor that is not the foreground display.

#![cfg(windows)]

use std::mem::size_of;

use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::Threading::{
    GetCurrentProcess, ProcessPowerThrottling, SetProcessInformation,
    PROCESS_POWER_THROTTLING_CURRENT_VERSION, PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
    PROCESS_POWER_THROTTLING_STATE,
};

pub fn disable_background_execution_throttling() {
    let mut state = PROCESS_POWER_THROTTLING_STATE {
        Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        StateMask: 0,
    };
    let process: HANDLE = unsafe { GetCurrentProcess() };
    let result = unsafe {
        SetProcessInformation(
            process,
            ProcessPowerThrottling,
            &mut state as *mut PROCESS_POWER_THROTTLING_STATE as *const std::ffi::c_void,
            size_of::<PROCESS_POWER_THROTTLING_STATE>() as u32,
        )
    };
    if result.is_err() && crate::debug_log::is_category_enabled("core.platform") {
        eprintln!("[ruforge] ProcessPowerThrottling disable failed: {result:?}");
    }
}
