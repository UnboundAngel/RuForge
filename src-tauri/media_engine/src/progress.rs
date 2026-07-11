use crate::types::{DownloadProgress, DownloadStatus};

#[derive(Debug, Default, Clone)]
pub struct PlaylistProgressExtras {
    pub current_index: Option<u32>,
    pub total_items: Option<u32>,
    pub current_item_title: Option<String>,
}

pub fn parse_playlist_download_line(line: &str) -> Option<(u32, u32, Option<String>)> {
    if !line.contains("[download]") {
        return None;
    }
    let after = line
        .find("Downloading ")
        .map(|k| line[k + "Downloading ".len()..].trim_start())?;
    let (head, tail_raw) = match after.split_once(" - ") {
        Some((h, t)) => (h.trim(), Some(t.trim())),
        None => (after.trim(), None),
    };

    let head = ["video ", "item ", "entries ", "videos "]
        .into_iter()
        .find_map(|p| head.strip_prefix(p))?;

    let sep = head.split_once(" of ")?;
    let current: u32 = sep.0.trim().parse().ok()?;
    let total: u32 = sep.1.split_whitespace().next()?.trim().parse().ok()?;
    if total == 0 || current == 0 || current > total {
        return None;
    }
    let idx0 = current - 1;
    let tail_title = tail_raw.filter(|t| !t.is_empty()).map(|t| t.to_string());
    Some((idx0, total, tail_title))
}

fn iec_unit_multiplier(unit: &str) -> Option<f64> {
    match unit.to_uppercase().as_str() {
        "" | "B" => Some(1.0),
        "K" | "KB" | "KIB" => Some(1024.0),
        "M" | "MB" | "MIB" => Some((1024_i64 * 1024) as f64),
        "G" | "GB" | "GIB" => Some((1024_i64 * 1024 * 1024) as f64),
        "T" | "TB" | "TIB" => Some((1024_i64 * 1024 * 1024 * 1024) as f64),
        _ => None,
    }
}

pub fn parse_size_token_to_bytes(tok: &str) -> Option<u64> {
    let mut t = tok.trim().trim_start_matches('~');
    t = t.trim_end_matches(|c: char| c == ')' || c == ']' || c == ',');
    if t.is_empty() {
        return None;
    }
    let split_idx = t
        .char_indices()
        .find(|(_, c)| !c.is_ascii_digit() && *c != '.')
        .map(|(i, _)| i)
        .unwrap_or(t.len());
    let (num_raw, unit_raw) = t.split_at(split_idx);
    let num: f64 = num_raw.parse().ok()?;
    if !num.is_finite() || num < 0.0 {
        return None;
    }
    let mult = iec_unit_multiplier(unit_raw.trim())?;
    let bytes_f = (num * mult).round();
    if bytes_f <= 0.0 || bytes_f > u64::MAX as f64 {
        return None;
    }
    Some(bytes_f as u64)
}

pub fn parse_percent_of_total_bytes(line: &str, percentage: f32) -> Option<(u64, u64)> {
    let needle = "% of ";
    let pos = line.find(needle)?;
    let rest = line[pos + needle.len()..].trim_start();
    let tok = rest.split_whitespace().next()?;
    let total = parse_size_token_to_bytes(tok)?;
    let pct = f64::from(percentage);
    if !pct.is_finite() {
        return None;
    }
    let clamped = pct.clamp(0.0, 100.0);
    let downloaded = ((clamped / 100.0) * total as f64).round();
    if downloaded < 0.0 || downloaded > u64::MAX as f64 {
        return None;
    }
    Some((downloaded as u64, total))
}

pub fn line_is_post_process(line: &str) -> bool {
    const MARKERS: &[&str] = &[
        "[ExtractAudio]",
        "[Merger]",
        "[ffmpeg]",
        "[FixupM3u8]",
        "[FixupM4a]",
        "[FixupStretched]",
        "[FixupTimestamp]",
        "[FixupDuration]",
        "[FixupDuplicateMoov]",
        "[VideoConvertor]",
        "[VideoRemuxer]",
        "[EmbedSubtitle]",
        "[Metadata]",
        "[SubtitlesConvertor]",
        "[Concat]",
    ];
    MARKERS.iter().any(|m| line.contains(m))
}

#[derive(Debug, Default)]
pub struct ProgressTracker {
    pub download_reached_full: bool,
    pub last_percentage: f32,
    pub last_speed: String,
    pub last_eta: String,
    pub last_downloaded_bytes: Option<u64>,
    pub last_total_bytes: Option<u64>,
    pub extras: PlaylistProgressExtras,
    pub last_emit_at: Option<std::time::Instant>,
}

impl ProgressTracker {
    pub const EMIT_INTERVAL_MS: u64 = 250;
    pub const STDERR_MAX_BYTES: usize = 32_768;

    pub fn handle_stdout_line(&mut self, line: &str) -> Option<DownloadProgress> {
        if line.contains("[download]") {
            if let Some((idx, total, tit)) = parse_playlist_download_line(line) {
                self.extras.current_index = Some(idx);
                self.extras.total_items = Some(total);
                if tit.is_some() {
                    self.extras.current_item_title = tit;
                }
            }
        }

        if line.contains("[download]") && line.contains('%') {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let percent_str = parts[1].trim_end_matches('%');
                if let Ok(percentage) = percent_str.parse::<f32>() {
                    let mut speed = "";
                    let mut eta = "";
                    for (i, part) in parts.iter().enumerate() {
                        if part.contains("/s") || part.contains("B/s") {
                            speed = part;
                        }
                        if part.contains(':') && i > 4 {
                            eta = part;
                        }
                    }
                    let sizes = parse_percent_of_total_bytes(line, percentage);
                    let (downloaded_bytes, total_bytes) = match sizes {
                        Some((d, t)) => (Some(d), Some(t)),
                        None => (None, None),
                    };
                    if percentage >= 100.0 {
                        self.download_reached_full = true;
                    }
                    self.last_percentage = percentage;
                    self.last_speed = speed.to_string();
                    self.last_eta = eta.to_string();
                    self.last_downloaded_bytes = downloaded_bytes;
                    self.last_total_bytes = total_bytes;
                    return self.maybe_emit(DownloadStatus::Downloading, percentage);
                }
            }
        } else if self.download_reached_full && line_is_post_process(line) {
            let pct = self.last_percentage.max(100.0);
            return self.maybe_emit(DownloadStatus::PostProcessing, pct);
        }
        None
    }

    fn maybe_emit(&mut self, status: DownloadStatus, percentage: f32) -> Option<DownloadProgress> {
        let now = std::time::Instant::now();
        let should = match self.last_emit_at {
            None => true,
            Some(prev) => now.duration_since(prev).as_millis() as u64 >= Self::EMIT_INTERVAL_MS,
        };
        if !should {
            return None;
        }
        self.last_emit_at = Some(now);
        Some(DownloadProgress {
            job_id: String::new(),
            status,
            percentage,
            speed: self.last_speed.clone(),
            eta: self.last_eta.clone(),
            current_index: self.extras.current_index,
            total_items: self.extras.total_items,
            current_item_title: self.extras.current_item_title.clone(),
            downloaded_bytes: self.last_downloaded_bytes,
            total_bytes: self.last_total_bytes,
        })
    }
}

pub fn append_stderr_bounded(log: &mut String, line_bytes: &[u8], max_bytes: usize) {
    let line = String::from_utf8_lossy(line_bytes);
    let addition = line.as_ref();
    if log.len() + addition.len() > max_bytes {
        let keep = max_bytes.saturating_sub(addition.len());
        if keep < log.len() {
            let start = log.len() - keep;
            let boundary = ceil_utf8_char_boundary(log, start);
            log.drain(..boundary);
        }
    }
    log.push_str(addition);
}

fn ceil_utf8_char_boundary(s: &str, byte_idx: usize) -> usize {
    let mut i = byte_idx.min(s.len());
    while i < s.len() && !s.is_char_boundary(i) {
        i += 1;
    }
    i
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn post_process_detected() {
        assert!(line_is_post_process(
            "[ExtractAudio] Destination: foo.m4a"
        ));
    }

    #[test]
    fn percent_parses_sizes() {
        let line = "[download]  50.0% of   10.00MiB at 1.00MiB/s ETA 00:05";
        let sizes = parse_percent_of_total_bytes(line, 50.0).unwrap();
        assert!(sizes.0 > 0);
        assert!(sizes.1 > sizes.0);
    }
}
