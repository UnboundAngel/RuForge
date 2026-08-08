pub mod commands;

use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::{Deserialize, Serialize};

pub const CLIENT_ID: &str = "1535637767730626720";
pub const SET_ACTIVITY_FLOOR: Duration = Duration::from_secs(15);

const BACKOFF_STEPS: &[Duration] = &[
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(15),
    Duration::from_secs(30),
];
const WORKER_TICK: Duration = Duration::from_millis(200);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscordActivityKind {
    Playing,
    Listening,
    Watching,
}

impl DiscordActivityKind {
    fn to_activity_type(self) -> ActivityType {
        match self {
            Self::Playing => ActivityType::Playing,
            Self::Listening => ActivityType::Listening,
            Self::Watching => ActivityType::Watching,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordActivityPayload {
    pub kind: DiscordActivityKind,
    pub details: Option<String>,
    pub state: Option<String>,
    pub start_timestamp: Option<i64>,
    pub end_timestamp: Option<i64>,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub small_image: Option<String>,
    pub small_text: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscordRpcConnection {
    Disabled,
    Disconnected,
    Connected,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordRpcStatus {
    pub enabled: bool,
    pub connection: DiscordRpcConnection,
    pub has_activity: bool,
}

enum WorkerMsg {
    SetEnabled(bool),
    SetActivity(DiscordActivityPayload),
    Clear,
    Shutdown,
}

struct SharedStatus {
    enabled: bool,
    connection: DiscordRpcConnection,
    has_activity: bool,
}

pub struct DiscordRpcState {
    tx: Mutex<Option<Sender<WorkerMsg>>>,
    status: Arc<Mutex<SharedStatus>>,
    join: Mutex<Option<JoinHandle<()>>>,
}

impl DiscordRpcState {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        let status = Arc::new(Mutex::new(SharedStatus {
            enabled: false,
            connection: DiscordRpcConnection::Disabled,
            has_activity: false,
        }));
        let status_worker = Arc::clone(&status);
        let join = thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || worker_loop(rx, status_worker))
            .expect("discord-rpc worker thread");
        Self {
            tx: Mutex::new(Some(tx)),
            status,
            join: Mutex::new(Some(join)),
        }
    }

    fn send(&self, msg: WorkerMsg) {
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(msg);
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.send(WorkerMsg::SetEnabled(enabled));
    }

    pub fn set_activity(&self, payload: DiscordActivityPayload) {
        self.send(WorkerMsg::SetActivity(payload));
    }

    pub fn clear_activity(&self) {
        self.send(WorkerMsg::Clear);
    }

    pub fn status(&self) -> DiscordRpcStatus {
        let s = self.status.lock().unwrap();
        DiscordRpcStatus {
            enabled: s.enabled,
            connection: s.connection,
            has_activity: s.has_activity,
        }
    }

    pub fn shutdown(&self) {
        self.send(WorkerMsg::Shutdown);
        if let Some(tx) = self.tx.lock().unwrap().take() {
            drop(tx);
        }
        if let Some(join) = self.join.lock().unwrap().take() {
            let _ = join.join();
        }
    }
}

fn set_status(status: &Arc<Mutex<SharedStatus>>, f: impl FnOnce(&mut SharedStatus)) {
    if let Ok(mut s) = status.lock() {
        f(&mut s);
    }
}

fn apply_payload<'a>(payload: &'a DiscordActivityPayload) -> Activity<'a> {
    let mut activity = Activity::new().activity_type(payload.kind.to_activity_type());
    if let Some(ref details) = payload.details {
        activity = activity.details(details.as_str());
    }
    if let Some(ref state) = payload.state {
        activity = activity.state(state.as_str());
    }
    if payload.start_timestamp.is_some() || payload.end_timestamp.is_some() {
        let mut ts = Timestamps::new();
        if let Some(start) = payload.start_timestamp {
            ts = ts.start(start);
        }
        if let Some(end) = payload.end_timestamp {
            ts = ts.end(end);
        }
        activity = activity.timestamps(ts);
    }
    let has_large = payload.large_image.as_ref().is_some_and(|s| !s.is_empty());
    if has_large
        || payload.large_text.is_some()
        || payload.small_image.is_some()
        || payload.small_text.is_some()
    {
        let mut assets = Assets::new();
        if let Some(ref key) = payload.large_image {
            if !key.is_empty() {
                assets = assets.large_image(key.as_str());
            }
        }
        if let Some(ref text) = payload.large_text {
            assets = assets.large_text(text.as_str());
        }
        // Discord only shows small_image when large_image is also set.
        if has_large {
            if let Some(ref key) = payload.small_image {
                if !key.is_empty() {
                    assets = assets.small_image(key.as_str());
                }
            }
            if let Some(ref text) = payload.small_text {
                assets = assets.small_text(text.as_str());
            }
        }
        activity = activity.assets(assets);
    }
    activity
}

fn try_clear(client: &mut Option<DiscordIpcClient>) {
    if let Some(c) = client.as_mut() {
        let _ = c.clear_activity();
    }
}

fn try_close(client: &mut Option<DiscordIpcClient>) {
    if let Some(mut c) = client.take() {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}

fn try_connect() -> Option<DiscordIpcClient> {
    let mut client = DiscordIpcClient::new(CLIENT_ID);
    match client.connect() {
        Ok(()) => Some(client),
        Err(_) => None,
    }
}

fn worker_loop(rx: Receiver<WorkerMsg>, status: Arc<Mutex<SharedStatus>>) {
    let mut enabled = false;
    let mut client: Option<DiscordIpcClient> = None;
    let mut desired: Option<DiscordActivityPayload> = None;
    let mut last_sent: Option<DiscordActivityPayload> = None;
    let mut dirty = false;
    let mut force_flush = false;
    let mut last_send_at: Option<Instant> = None;
    let mut backoff_idx = 0usize;
    let mut next_connect_at = Instant::now();
    let mut shutting_down = false;

    loop {
        loop {
            match rx.try_recv() {
                Ok(WorkerMsg::SetEnabled(next)) => {
                    enabled = next;
                    set_status(&status, |s| s.enabled = next);
                    if !next {
                        desired = None;
                        dirty = false;
                        force_flush = true;
                        backoff_idx = 0;
                    }
                }
                Ok(WorkerMsg::SetActivity(payload)) => {
                    if Some(&payload) == last_sent.as_ref() && Some(&payload) == desired.as_ref() {
                        continue;
                    }
                    desired = Some(payload);
                    dirty = true;
                }
                Ok(WorkerMsg::Clear) => {
                    desired = None;
                    dirty = false;
                    force_flush = true;
                }
                Ok(WorkerMsg::Shutdown) => {
                    shutting_down = true;
                    enabled = false;
                    desired = None;
                    dirty = false;
                    force_flush = true;
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    shutting_down = true;
                    enabled = false;
                    desired = None;
                    dirty = false;
                    force_flush = true;
                    break;
                }
            }
        }

        if !enabled {
            if client.is_some() || last_sent.is_some() || force_flush {
                try_clear(&mut client);
                try_close(&mut client);
                last_sent = None;
                force_flush = false;
                set_status(&status, |s| {
                    s.connection = DiscordRpcConnection::Disabled;
                    s.has_activity = false;
                });
            } else {
                set_status(&status, |s| {
                    s.connection = DiscordRpcConnection::Disabled;
                    s.has_activity = false;
                });
            }
            if shutting_down {
                break;
            }
            thread::sleep(WORKER_TICK);
            continue;
        }

        if client.is_none() {
            set_status(&status, |s| {
                s.connection = DiscordRpcConnection::Disconnected;
            });
            let now = Instant::now();
            if now >= next_connect_at {
                if let Some(c) = try_connect() {
                    client = Some(c);
                    backoff_idx = 0;
                    next_connect_at = Instant::now();
                    if desired.is_some() {
                        dirty = true;
                        force_flush = true;
                    }
                    set_status(&status, |s| {
                        s.connection = DiscordRpcConnection::Connected;
                    });
                } else {
                    let wait = BACKOFF_STEPS[backoff_idx.min(BACKOFF_STEPS.len() - 1)];
                    next_connect_at = now + wait;
                    if backoff_idx + 1 < BACKOFF_STEPS.len() {
                        backoff_idx += 1;
                    }
                }
            }
            if client.is_none() {
                if shutting_down {
                    break;
                }
                thread::sleep(WORKER_TICK);
                continue;
            }
        }

        set_status(&status, |s| {
            s.connection = DiscordRpcConnection::Connected;
        });

        if force_flush && desired.is_none() {
            try_clear(&mut client);
            last_sent = None;
            force_flush = false;
            dirty = false;
            set_status(&status, |s| s.has_activity = false);
            if shutting_down {
                try_close(&mut client);
                break;
            }
            thread::sleep(WORKER_TICK);
            continue;
        }

        let should_send = dirty
            && desired.is_some()
            && (force_flush
                || last_send_at
                    .map(|t| t.elapsed() >= SET_ACTIVITY_FLOOR)
                    .unwrap_or(true));

        if should_send {
            if let Some(ref payload) = desired {
                if Some(payload) == last_sent.as_ref() {
                    dirty = false;
                    force_flush = false;
                } else {
                    let activity = apply_payload(payload);
                    match client.as_mut().unwrap().set_activity(activity) {
                        Ok(()) => {
                            last_sent = desired.clone();
                            last_send_at = Some(Instant::now());
                            dirty = false;
                            force_flush = false;
                            set_status(&status, |s| s.has_activity = true);
                        }
                        Err(_) => {
                            try_close(&mut client);
                            last_sent = None;
                            set_status(&status, |s| {
                                s.connection = DiscordRpcConnection::Disconnected;
                                s.has_activity = false;
                            });
                            next_connect_at = Instant::now();
                            backoff_idx = 0;
                        }
                    }
                }
            }
        }

        if shutting_down {
            try_clear(&mut client);
            try_close(&mut client);
            break;
        }

        thread::sleep(WORKER_TICK);
    }
}
