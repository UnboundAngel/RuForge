use media_engine::ytdlp_args::DownloadPaths;

use super::downloader::DownloadOptions;

pub(super) fn download_paths(options: &DownloadOptions) -> DownloadPaths {
    DownloadPaths {
        output_dir: options.output_dir.clone(),
        filename_template: options.filename_template.clone(),
        playlist_output_folder: options.playlist_output_folder.clone(),
        playlist_index: options.playlist_index,
        playlist_index_width: options.playlist_index_width,
    }
}
