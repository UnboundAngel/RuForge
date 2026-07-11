use std::path::Path;

use serde_json::Value;

use crate::error::{EngineError, EngineErrorCode};
use crate::types::{AuthConfig, ValidatedDownloadChoices};
use crate::url::validate_format_selector;
use crate::ytdlp_json::{ytdlp_usable_playlist_entries, DEFAULT_AUDIO_FORMAT};

#[derive(Debug, Clone)]
pub struct DownloadPaths {
    pub output_dir: String,
    pub filename_template: String,
    pub playlist_output_folder: Option<String>,
    pub playlist_index: Option<u32>,
}

pub fn normalize_ytdlp_audio_format(raw: &str) -> String {
    match raw.trim().to_lowercase().as_str() {
        "mp3" => "mp3".into(),
        "opus" => "opus".into(),
        _ => DEFAULT_AUDIO_FORMAT.into(),
    }
}

pub fn sanitize_playlist_folder_name(raw: &str) -> String {
    let trimmed = raw.trim();
    let mut out: String = trimmed
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    while out.ends_with('.') || out.ends_with(char::is_whitespace) {
        if out.is_empty() {
            break;
        }
        out.pop();
    }
    let out = out.trim().to_string();
    if out.is_empty() {
        "playlist".to_string()
    } else {
        out.chars().take(200).collect()
    }
}

pub fn effective_filename_template(
    metadata_probe: &Value,
    user_template: &str,
    choices: &ValidatedDownloadChoices,
    paths: &DownloadPaths,
) -> String {
    let stem = user_template
        .strip_suffix(".%(ext)s")
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("%(title)s");

    if let Some(folder) = paths
        .playlist_output_folder
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        let idx = paths.playlist_index.unwrap_or(0);
        let item_name = if idx > 0 {
            format!("{:02} - {}", idx, stem)
        } else {
            stem.to_string()
        };
        return format!("Playlists/{}/{}/{}.%(ext)s", folder, item_name, item_name);
    }

    if ytdlp_usable_playlist_entries(metadata_probe).is_some() {
        let raw = metadata_probe
            .get("playlist_title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .or_else(|| {
                metadata_probe
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or("playlist");
        let folder = sanitize_playlist_folder_name(raw);
        return format!("Playlists/{}/{}/{}.%(ext)s", folder, stem, stem);
    }

    let bucket = if choices.audio_only { "Music" } else { "Videos" };
    format!("{}/{}/{}.%(ext)s", bucket, stem, stem)
}

pub fn destination_summary(output_dir: &str, filename_template_eff: &str) -> String {
    format!("{}/{}", output_dir.trim_end_matches(['/', '\\']), filename_template_eff)
}

pub fn build_inspect_args(url: &str, format: Option<&str>, auth: Option<&AuthConfig>) -> Vec<String> {
    let mut args = vec!["-J".into(), "-s".into()];
    if let Some(f) = format.filter(|s| !s.is_empty()) {
        args.push("-f".into());
        args.push(f.to_string());
    }
    push_auth_args(&mut args, auth);
    push_politeness_args(&mut args);
    args.push(url.to_string());
    args
}

pub fn build_download_args(
    url: &str,
    choices: &ValidatedDownloadChoices,
    output_dir: &str,
    filename_template_eff: &str,
    resume: bool,
    auth: Option<&AuthConfig>,
    js_runtime_path: Option<&Path>,
) -> Result<Vec<String>, EngineError> {
    let mut args = vec![
        "-P".to_string(),
        output_dir.to_string(),
        "-o".to_string(),
        filename_template_eff.to_string(),
        "--windows-filenames".to_string(),
        "--no-restrict-filenames".to_string(),
        "--trim-filenames".to_string(),
        "200".to_string(),
        "--newline".to_string(),
        "--write-info-json".to_string(),
        "--write-thumbnail".to_string(),
        "--convert-thumbnails".to_string(),
        "jpg".to_string(),
    ];

    if choices.audio_only {
        let audio_fmt = normalize_ytdlp_audio_format(&choices.audio_format);
        args.push("-f".to_string());
        args.push("bestaudio[ext=m4a]/bestaudio".to_string());
        args.push("-x".to_string());
        args.push("--audio-format".to_string());
        args.push(audio_fmt);
        args.push("--no-keep-video".to_string());
    } else {
        let fmt = validate_format_selector(&choices.video_format)?;
        args.push("-f".to_string());
        args.push(fmt);
    }

    if resume {
        args.push("--continue".to_string());
    }

    let sub_langs = choices.sub_langs.trim();
    if !choices.audio_only && !sub_langs.is_empty() {
        args.push("--write-subs".to_string());
        args.push("--write-auto-subs".to_string());
        args.push("--sub-langs".to_string());
        args.push(sub_langs.to_string());
        args.push("--convert-subs".to_string());
        args.push("vtt".to_string());
    }

    push_auth_args(&mut args, auth);
    if let Some(deno) = js_runtime_path {
        args.push("--js-runtimes".into());
        args.push(format!("deno:{}", deno.display()));
    }
    push_politeness_args(&mut args);
    args.push("--retries".to_string());
    args.push("10".to_string());
    args.push("--fragment-retries".to_string());
    args.push("10".to_string());
    args.push(url.to_string());
    Ok(args)
}

pub fn push_auth_args(args: &mut Vec<String>, auth: Option<&AuthConfig>) {
    let Some(auth) = auth else { return };
    if let Some(file) = auth
        .cookie_file
        .as_deref()
        .filter(|s| !s.is_empty())
    {
        args.push("--cookies".into());
        args.push(file.to_string());
        return;
    }
    if let Some(browser) = auth
        .browser_label
        .as_deref()
        .filter(|s| !s.is_empty() && *s != "chrome")
    {
        args.push("--cookies-from-browser".into());
        args.push(browser.to_string());
    }
}

pub fn push_politeness_args(args: &mut Vec<String>) {
    if args.iter().any(|a| a == "--sleep-interval") {
        return;
    }
    args.push("--sleep-interval".into());
    args.push("1".into());
    args.push("--max-sleep-interval".into());
    args.push("3".into());
}

pub fn validate_choices_against_inspection(
    choices: &ValidatedDownloadChoices,
    allowed_video_formats: &[String],
    allowed_audio_formats: &[String],
) -> Result<(), EngineError> {
    validate_format_selector(if choices.audio_only {
        "bestaudio[ext=m4a]/bestaudio"
    } else {
        &choices.video_format
    })?;
    if !choices.audio_only
        && !allowed_video_formats
            .iter()
            .any(|f| f == &choices.video_format)
    {
        return Err(EngineError::new(
            EngineErrorCode::FormatUnavailable,
            "Selected video format is not allowed for this inspection",
        ));
    }
    let audio_fmt = normalize_ytdlp_audio_format(&choices.audio_format);
    if !allowed_audio_formats.iter().any(|f| f == &audio_fmt) {
        return Err(EngineError::new(
            EngineErrorCode::FormatUnavailable,
            "Selected audio format is not allowed for this inspection",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn single_video_template_uses_bucket() {
        let probe = json!({"title": "Test"});
        let choices = ValidatedDownloadChoices {
            video_format: "best".into(),
            audio_only: false,
            audio_format: "m4a".into(),
            sub_langs: String::new(),
        };
        let paths = DownloadPaths {
            output_dir: "/out".into(),
            filename_template: "%(title)s.%(ext)s".into(),
            playlist_output_folder: None,
            playlist_index: None,
        };
        let tpl = effective_filename_template(&probe, "%(title)s.%(ext)s", &choices, &paths);
        assert!(tpl.starts_with("Videos/"));
    }
}
