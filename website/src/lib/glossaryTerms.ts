/**
 * Brief one-line glossary definitions used by hover tooltips.
 * Keys are lowercase term names. Values are short, plain-text descriptions.
 * These render in a small floating popup when the reader hovers a
 * `<span class="docs-term" data-term="...">` element anywhere in the docs.
 */

export const GLOSSARY_TERMS: Record<string, string> = {
  job: 'A single download task. Paste a URL and click download to create one.',
  queue: 'The list of all active and pending download jobs, visible in the floating drawer.',
  hero: 'The large progress area at the top of the downloader showing the focused job.',
  'stall watchdog':
    'Background timer that kills stuck downloads when no data arrives for too long.',
  processing:
    'Post-download phase where ffmpeg merges video and audio streams or extracts audio.',
  entry: 'A single item in your media library (standalone file or playlist collection).',
  'playlist collection':
    'A group of files downloaded together as a playlist, shown as a stack card.',
  gallery: 'Another name for the media library grid.',
  'scan root':
    'A folder the library watches for media files. Always two: internal vault and download path.',
  card: 'The visual tile in the library grid showing thumbnail, title, duration, and progress.',
  sidecar: 'A companion file that stores metadata about a downloaded video.',
  '.info.json':
    'Created by yt-dlp during download. Contains title, uploader, chapters, and source URL.',
  '.sponsorblock.json':
    'Stores SponsorBlock segments and chapters so they are not re-fetched every play.',
  'sprite sheet':
    'Grid of thumbnail frames from ffmpeg, used for hover previews on the scrub bar.',
  poster: 'Single-frame thumbnail from ffmpeg, used as cover art when no yt-dlp thumbnail exists.',
  player: 'The built-in video/audio player with chapters, subtitles, and SponsorBlock overlays.',
  'mini player':
    'Separate borderless window that floats on top of other apps, resizable from large to tiny.',
  'control dock': 'Frosted bar at the bottom of the player with play/pause, volume, and loop.',
  'chapter scrubber':
    'Segmented progress bar dividing the video into chapters from yt-dlp metadata.',
  'auto-advance':
    'When a video ends, automatically plays the next file in the folder or library.',
  'scrub preview': 'Thumbnail images that appear on hover over the progress bar (from sprite sheets).',
  'internal vault':
    'Folder RuForge manages inside its app data directory for storing downloads.',
  'download path': 'The custom folder you pick for new downloads (alternative to internal vault).',
};
