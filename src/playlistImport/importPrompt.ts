/**
 * The prompt the Music import modal copies for the user's own chatbot. Kept here so the modal
 * and `docs/ruforge/plans/playlist-import.plan.md` describe one format. Changing the shape
 * means bumping `ruforge_import` and the parser with it.
 */
const FENCE = "```";

export const IMPORT_PROMPT = [
  "I'm going to give you screenshots (or pasted text) of a music playlist. Turn it into JSON for the RuForge music app.",
  "",
  "Rules:",
  `- Reply with ONE ${FENCE}json code block and nothing else. No explanation before or after.`,
  "- Use exactly this shape:",
  "",
  `${FENCE}json`,
  "{",
  '  "ruforge_import": 1,',
  '  "playlist": { "name": "Playlist name or null", "source": "spotify" },',
  '  "tracks": [',
  '    { "title": "Song title", "artists": ["Artist 1", "Artist 2"], "album": "Album or null", "duration": "3:20", "unclear": false }',
  "  ]",
  "}",
  FENCE,
  "",
  '- "source" is one of: spotify, apple_music, youtube_music, tidal, soundcloud, other, or null.',
  "- List every song in the order it appears, top to bottom, screenshot by screenshot.",
  "- The screenshots may overlap. If the same song appears at the bottom of one screenshot and the top of the next, list it once.",
  '- Copy titles and artist names exactly as shown, including things like "(feat. ...)", "- Remastered", "(Live)". Don\'t fix spelling, don\'t translate, don\'t shorten.',
  '- Put each artist in its own string in "artists".',
  '- "duration" is the length exactly as shown (like "3:20"), or null if it isn\'t visible. Do not use the "date added" or play count columns.',
  "- If something isn't visible, use null. Never guess or fill in from memory.",
  '- If a title or artist is cut off or hard to read, write what you can see and set "unclear": true.',
  "- Skip anything that isn't a song (ads, headers, \"recommended\" sections below the playlist).",
].join("\n");
