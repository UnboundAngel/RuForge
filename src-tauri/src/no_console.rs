//! Every child process RuForge spawns on Windows must pass CREATE_NO_WINDOW. Release builds run
//! as a GUI subsystem app with no console, so a console child (attrib, deno, yt-dlp) otherwise
//! gets a fresh terminal window that flashes on screen.

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub trait NoConsole {
    fn no_console(&mut self) -> &mut Self;
}

impl NoConsole for std::process::Command {
    fn no_console(&mut self) -> &mut Self {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}

impl NoConsole for tokio::process::Command {
    fn no_console(&mut self) -> &mut Self {
        #[cfg(windows)]
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }
}

/// `attrib +h` without a console window, for RuForge's own thumbnail folders.
#[cfg(windows)]
pub fn hide_path(path: &std::path::Path) {
    let _ = std::process::Command::new("attrib").no_console().arg("+h").arg(path).status();
}
