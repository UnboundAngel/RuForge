// Must match every network call the app makes; release step 8e checks it.
export const NETWORK_TABLE = {
  headers: ['Service', 'When', 'What it gets'],
  rows: [
    ['<strong>YouTube</strong>', 'Downloads, video details, thumbnails, channel pages', 'The videos and channels you ask for'],
    ['<strong>SponsorBlock</strong>', 'Playing a video, if SponsorBlock is on in Settings &gt; Playback', 'A short piece of a hash of the video ID, never the ID itself'],
    ['<strong>MusicBrainz</strong>, <strong>Cover Art Archive</strong>', 'After an audio download', 'The artist and song title'],
    ['<strong>LRCLIB</strong>', 'Loading lyrics', 'The artist, title, album, and length'],
    ['<strong>Wikipedia</strong>, <strong>Wikidata</strong>', 'Opening an artist page', 'The artist name'],
    ['<strong>ruforge.app</strong>, <strong>GitHub</strong>', 'When RuForge opens', 'A check for new RuForge and yt-dlp versions. The RuForge check goes to ruforge.app, which counts it and points it to GitHub'],
    ['<strong>GitHub</strong>, <strong>ruforge.app</strong>', 'First launch, after you confirm, or Download tools in Settings &gt; Updates', 'Downloads yt-dlp from its GitHub releases and ffmpeg from RuForge\'s GitHub releases (listed in ruforge.app/tools.json). Each file is checked against its SHA-256 before use'],
    ['<strong>ruforge.app</strong>', 'When RuForge opens, then every 6 hours', 'Fetches signed From the dev announcements and polls. Voting sends the poll, your choice and a random ID made for this install, never anything about you'],
    ['<strong>Discord</strong>', 'Only if you turn it on in Settings &gt; General (off by default)', 'What you\'re playing, sent to the Discord app on your PC'],
  ],
};
