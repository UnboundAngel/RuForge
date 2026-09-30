# Privacy


Last updated: September 29, 2026


RuForge runs on your computer. The project has no servers and no accounts, and nothing you download, watch or search is sent to the maintainer. This page lists what RuForge keeps on your PC and every place it connects to.


## What RuForge stores locally


- Videos and audio you download, saved to the folder you pick. RuForge reads the folders you add to the library and only moves or copies files when you run an action such as export or library migration.
- Sidecar files next to each download: video details from yt-dlp, SponsorBlock segments, music tags, lyrics, comments (only if you turn on comment downloads) and preview thumbnails.
- Settings, watch progress and other app state, kept in the app's WebView storage and in RuForge's app data folder on your PC.
- The channels you follow and your notifications, stored in the app data folder.
- Artist details for the Music "About the artist" sheet, cached in the app data folder after the first lookup.
- Optional sign-in data. If you sign in to YouTube in RuForge's built-in YouTube tab, browser session data is stored locally in RuForge's own WebView2 profile, separate from your normal browser. RuForge does not upload it.
- A log file in the app's log folder. By default it records warnings and errors; the Debugging tab can turn on more detail. Log lines can include file paths and links. The log stays on your PC unless you attach it to a bug report yourself.


## What leaves your computer


RuForge has no server of its own, so none of the traffic below goes to the project. Each connection goes straight from your PC to the service named.


**YouTube and other sites you download from.** When you queue a download or open a video's details, yt-dlp connects directly to the site to fetch it. RuForge does not proxy these requests. Downloads use no cookies unless you pick a cookie source in the downloader: Internal (RuForge's built-in YouTube tab), Firefox, Edge, Safari, Brave, or a cookies file. When yt-dlp uses cookies, it sends those cookies to the source site, not to RuForge. That is how signing in works. With Internal, RuForge copies your YouTube session from the built-in browser into a temporary file for that one job and deletes the file when the job ends.


**The YouTube tab.** The built-in YouTube and YouTube Music browser uses Microsoft Edge WebView2. The sites you open there see what they would see in Edge: your IP address, cookies and request headers. RuForge does not send that browsing anywhere else.


**Other YouTube requests.** Thumbnails, channel avatars and banners in the app load from YouTube's image servers. For view counts, channel details and new uploads from channels you follow, RuForge asks YouTube directly without your cookies. Followed channels are checked through their public RSS feeds on the schedule you set (every 30 minutes by default). Two features are on by default and can be turned off in Settings: the YouTube home feed in the Video Library, which uses your YouTube session when you are signed in, and YouTube Music song suggestions, which send the IDs of songs in a playlist to YouTube to find similar tracks.


**SponsorBlock (on by default).** When you play a downloaded video that has a YouTube ID, RuForge sends the first four characters of a SHA-256 hash of that ID to sponsor.ajay.app. The response contains skip segments for every video sharing that prefix, and RuForge picks the matching one locally, so the full video ID never leaves your PC in the request. The request carries no cookies or account data. Segments are cached next to the file. SponsorBlock is an open-source service run by a third party. You can turn it off in Settings > Playback.


**Music metadata.** After each audio download, RuForge looks the track up on MusicBrainz using the artist and title from the file's tags or its YouTube details, and looks up the artist's genres. No account data is sent. Requests are spaced about one second apart, and the User-Agent identifies RuForge and its version (`RuForge/{version} ( https://ruforge.app )`). When a match includes a release and the track has no cover yet, RuForge downloads the front cover from Cover Art Archive using only the MusicBrainz release ID. Results are saved in `.musicmeta.json` files next to your tracks, so each track is looked up once. The Enrich music metadata action in the Debugging tab runs the same lookup for older files.


**Lyrics.** After each audio download, and when you open the lyrics view for a song with no saved lyrics, RuForge asks LRCLIB (lrclib.net) for lyrics, sending the artist, title, album and track length. You can also search LRCLIB by hand with an artist and title you type. The result is saved next to the file. When nothing is found, RuForge waits 7 days before trying that song again.


**About the artist.** When you open the About the artist sheet in Music, RuForge looks the artist name up on MusicBrainz, reads the biography from Wikipedia (through Wikidata when needed) and loads the artist photo from Wikimedia. The result is cached, so this happens once per artist.


**App updates.** On launch, and when you press Check now in Settings, RuForge fetches a small `updater.json` file from GitHub to see whether a newer version exists. When one is available, it also reads the list of recent releases from GitHub's API to show the release notes. No account or identifier is sent. The signed installer downloads from GitHub only after you choose to install.


**yt-dlp updates.** At startup RuForge checks GitHub's API for a newer yt-dlp release, at most once every 12 hours (the result is cached). The User-Agent names RuForge and its version. A new yt-dlp binary downloads from GitHub only when you choose to update it.


**Deno (optional).** YouTube sometimes requires a JavaScript runtime for yt-dlp. If you install Deno from Settings > Downloads, RuForge checks GitHub's API for the latest Deno release and downloads it from GitHub into your app data folder. Deno is not included in the RuForge installer, and nothing is downloaded until you press Install or Reinstall.


**Discord Rich Presence (off by default).** If you turn it on in Settings > General, RuForge passes your status to the Discord app on your PC over a local connection, and Discord shows it on your profile to people who can see your activity. The status can include the title of what you are playing or downloading, the song's artist, elapsed time, and which part of RuForge you are in. You can hide titles or the browsing status, or turn it off at any time. RuForge itself makes no network request for this.


**Links you open.** Links to GitHub, YouTube, artist pages and other sites open in your default browser.


## Domains RuForge contacts


- `youtube.com`, `music.youtube.com` and YouTube's media and image servers (`googlevideo.com`, `i.ytimg.com`, `yt3.googleusercontent.com`): downloads, the YouTube tab, thumbnails, previews and followed channels.
- Other video sites: only when you paste a link from them.
- `sponsor.ajay.app`: SponsorBlock segments when a video plays, if SponsorBlock is on.
- `raw.githubusercontent.com`: app update check on launch.
- `api.github.com`: release notes when an update is available, the yt-dlp release check at most every 12 hours, and the Deno release check when you install it.
- `github.com` and its download servers: RuForge, yt-dlp and Deno downloads when you choose to install them.
- `musicbrainz.org` and `coverartarchive.org`: music metadata after audio downloads and for About the artist.
- `lrclib.net`: lyrics after audio downloads and when you open lyrics.
- `wikidata.org`, `en.wikipedia.org` and `upload.wikimedia.org`: About the artist.


## What RuForge does not do


- We do not collect or report any data about your downloads, browsing or playback. yt-dlp and the built-in browser still connect to the sites you use, the same way any browser or downloader does.
- No analytics or telemetry in a standard session. Settings > General has a Debugging settings switch, off by default, that reveals optional usage and crash telemetry toggles, which are also off until you turn them on. With usage telemetry on, RuForge sends one event per launch with a random install ID. With crash telemetry on, pressing Report on the error screen also sends the first 200 characters of the error message. Both go to an Aptabase analytics service.
- No RuForge account, no login to RuForge and no cloud sync.
- No ads, no referral links and no affiliate rewrites of URLs.
- No background uploading of files, library data or watch history.


## Logs and crash data


RuForge does not collect crash data in a standard session. When something breaks, the error screen lets you copy the details or press Report, which opens a pre-filled GitHub issue in your browser. Nothing is posted until you review and submit it yourself. You can attach your log file the same way. You control what gets shared.


## Windows


The Windows installer is signed. Windows SmartScreen may check the signature against Microsoft's reputation service when you run the installer. That check is between your computer and Microsoft.


## Children


RuForge is not directed at children. It is a general-purpose desktop tool.


## Changes


If this page changes in a way that affects what data leaves your PC, the change ships with a release and is listed in its release notes, which the in-app updater shows.


## Contact


Open an issue on [GitHub Issues](https://github.com/UnboundAngel/RuForge/issues).
