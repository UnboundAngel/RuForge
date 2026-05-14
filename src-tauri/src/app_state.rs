use std::sync::Mutex;

#[derive(Default)]
pub struct AppConfig {
    pub minimize_to_tray: Mutex<bool>,
}
