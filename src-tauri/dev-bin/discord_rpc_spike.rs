use std::io::{self, Write};
use std::thread;
use std::time::Duration;

use discord_rich_presence::{
    activity::{Activity, ActivityType, StatusDisplayType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};

const CLIENT_ID: &str = "1535637767730626720";
const RATE_LIMIT_SECS: u64 = 15;

fn wait_enter(prompt: &str) {
    print!("{prompt}");
    let _ = io::stdout().flush();
    let mut line = String::new();
    let _ = io::stdin().read_line(&mut line);
}

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn rate_limit_countdown() {
    println!("  Rate-limit floor: waiting {RATE_LIMIT_SECS}s before this card is safe to trust…");
    for left in (1..=RATE_LIMIT_SECS).rev() {
        print!("\r  countdown {left:2}s   ");
        let _ = io::stdout().flush();
        thread::sleep(Duration::from_secs(1));
    }
    println!("\r  countdown  0s   ");
    println!("  SAFE TO READ NOW — Discord should be showing THIS step's payload.");
}

fn send_step(
    client: &mut DiscordIpcClient,
    step: &str,
    label: &str,
    payload: Activity<'_>,
) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string_pretty(&payload)?;
    println!("\n=== {step}: {label} ===");
    println!("payload JSON:");
    println!("{json}");
    client.set_activity(payload)?;
    println!("SET_ACTIVITY sent for {step}.");
    rate_limit_countdown();
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("discord_rpc_spike — Client ID {CLIENT_ID}");
    println!("Open Discord, then your own profile (Full Profile + User Popout + member list if in a server).");
    println!("Each step sleeps {RATE_LIMIT_SECS}s after SET_ACTIVITY so Discord does not drop updates.");
    println!("Only read the card after SAFE TO READ NOW, then press Enter.\n");

    // discord-rich-presence 1.1.0: new() is infallible; connect() is the fallible step.
    let mut client = DiscordIpcClient::new(CLIENT_ID);
    client.connect()?;
    println!("Connected to Discord IPC.");

    send_step(
        &mut client,
        "STEP 1",
        "Listening",
        Activity::new()
            .activity_type(ActivityType::Listening)
            .details("SPIKE track title")
            .state("SPIKE artist")
            .timestamps(Timestamps::new().start(now_unix())),
    )?;
    wait_enter("\nCheck Discord for STEP 1, then press Enter for STEP 2… ");

    send_step(
        &mut client,
        "STEP 2",
        "Watching",
        Activity::new()
            .activity_type(ActivityType::Watching)
            .details("SPIKE video title")
            .state("SPIKE watching state")
            .timestamps(Timestamps::new().start(now_unix())),
    )?;
    wait_enter("\nCheck Discord for STEP 2, then press Enter for STEP 3… ");

    send_step(
        &mut client,
        "STEP 3",
        "Playing",
        Activity::new()
            .activity_type(ActivityType::Playing)
            .details("SPIKE playing details")
            .state("SPIKE playing state")
            .timestamps(Timestamps::new().start(now_unix())),
    )?;
    wait_enter("\nCheck Discord for STEP 3, then press Enter for STEP 4… ");

    send_step(
        &mut client,
        "STEP 4",
        "StatusDisplayType::Details",
        Activity::new()
            .activity_type(ActivityType::Playing)
            .details("SPIKE status-display DETAILS field")
            .state("SPIKE status-display STATE field")
            .status_display_type(StatusDisplayType::Details)
            .timestamps(Timestamps::new().start(now_unix())),
    )?;
    println!("  Also glance at a server member list / sidebar status text.");
    wait_enter("\nCheck Discord for STEP 4, then press Enter for STEP 4b… ");

    send_step(
        &mut client,
        "STEP 4b",
        "StatusDisplayType::State",
        Activity::new()
            .activity_type(ActivityType::Playing)
            .details("SPIKE status-display DETAILS field")
            .state("SPIKE status-display STATE field")
            .status_display_type(StatusDisplayType::State)
            .timestamps(Timestamps::new().start(now_unix())),
    )?;
    wait_enter("\nCheck Discord for STEP 4b, then press Enter for STEP 5… ");

    send_step(
        &mut client,
        "STEP 5",
        "Playing browse, NO timestamps",
        Activity::new()
            .activity_type(ActivityType::Playing)
            .details("Exploring the video library")
            .state("SPIKE browse (no timestamps)"),
    )?;
    wait_enter("\nCheck Discord for STEP 5 (any elapsed timer?), then press Enter to clear and exit… ");

    client.clear_activity()?;
    println!("\nCleared activity. Done.");
    thread::sleep(Duration::from_millis(400));
    let _ = client.close();
    Ok(())
}
