/**
 * Brief one-line glossary definitions used by hover tooltips.
 * Keys are lowercase term names. Values are short, plain-text descriptions.
 * These render in a small floating popup when the reader hovers a
 * `<span class="docs-term" data-term="...">` element anywhere in the docs.
 */

export const GLOSSARY_TERMS: Record<string, string> = {
  job: 'One download. Paste a link and click Download to start one.',
  queue: 'All the jobs that are waiting or running. The sidebar Download button shows a progress ring while any are.',
  hero: 'The big area in the downloader with the video\'s title, thumbnail, and progress.',
  'stall watchdog':
    'Notices a download that stopped making progress and steps in, so it doesn\'t hang forever.',
  processing:
    'The last step of a download, when the video and audio get joined into one file.',
  entry: 'One item in your library: a single file or a whole playlist.',
  'playlist collection':
    'Videos downloaded together as a playlist. They show up as one stack you can open.',
  gallery: 'Another name for the library grid.',
  'scan folder':
    'A folder you added so its files show up in your library. The internal vault is always one of them.',
  'scan root':
    'A folder you added so its files show up in your library. The internal vault is always one of them.',
  card: 'The tile you click in the library, with a thumbnail and title.',
  sidecar: 'A small file saved next to a video that describes it. Keep it with the video when you move it.',
  '.info.json':
    'The video\'s details from YouTube: title, channel, chapters, and the original link.',
  '.sponsorblock.json':
    'Saved sponsor segments, so RuForge doesn\'t look them up every time you play the video.',
  'sprite sheet':
    'A grid of small frames from the video. It powers the preview when you hover the seek bar.',
  poster: 'A cover image RuForge makes from a frame of the video.',
  player: 'Plays video and audio, with chapters, subtitles, keyboard shortcuts, and SponsorBlock.',
  'mini player':
    'A small separate window, so you can keep watching while you use other apps.',
  'control dock': 'The bar at the bottom of the player with play/pause, volume, and loop.',
  'chapter scrubber':
    'The seek bar split into the video\'s chapters. Hover a part to see its name, click to jump there.',
  'auto-advance':
    'When a video ends, the next file in the same folder starts.',
  'scrub preview': 'The small picture that shows up when you hover the seek bar.',
  'internal vault':
    'RuForge\'s own download folder, C:\\RuForge\\Media by default. It\'s always in your library.',
  'download path': 'A custom folder you pick for new downloads instead of the internal vault.',
};
