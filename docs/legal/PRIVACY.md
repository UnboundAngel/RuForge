\# Privacy



Last updated: May 21, 2026



RuForge runs entirely on your computer. This page tells you exactly what

data exists, where it lives, and what leaves the machine.



\## What RuForge stores locally



\- Videos and audio you download. Saved to the folder you pick. RuForge

&#x20; does not move, copy, or read them outside that folder unless you point

&#x20; the library at them.

\- A local library index. Tracks file paths, durations, thumbnails, watch

&#x20; progress, view counters, and chapter data for files you have

&#x20; downloaded or scanned in. This index is a local database. It is not

&#x20; synced anywhere.

\- Settings. Output paths, default formats, accent color, SponsorBlock

&#x20; preferences, and similar. Stored in the app's WebView storage and

&#x20; local app data folders on your PC, not on any RuForge server.

\- Download metadata cache (titles, thumbnails, file sizes). Speeds up

&#x20; re-queueing. Local only.

\- Optional cookie data. If you use the in-app browser to log into a site

&#x20; so yt-dlp can download restricted content, browser session data is

&#x20; stored locally for that webview. RuForge does not upload it.



\## What leaves your computer



Five things, all initiated by you or by features you can turn off.



\*\*1. yt-dlp requests.\*\* When you queue a download, yt-dlp connects

directly to the source site (YouTube or other sites it supports) to

fetch the media. RuForge does not proxy these requests. When yt-dlp

uses cookies (from your browser or from RuForge's internal browser

profile), it sends those cookies to the source site, not to RuForge.

That is how authentication works.



\*\*2. SponsorBlock (default on).\*\* When you play a video that has a

YouTube ID, RuForge sends the first four characters of a SHA-256 hash

of that ID to sponsor.ajay.app. The response contains skip segments for

all videos sharing that hash prefix, and RuForge picks the matching one

locally. The full video ID never leaves your machine in the request.

Skip segments are cached on disk next to the file. SponsorBlock is

operated by a third party and is open source. You can disable it in

Settings → Playback.



\*\*3. App update checks.\*\* On launch, RuForge fetches a single JSON file

from GitHub to see whether a newer version of RuForge exists. The

request includes your current version and the standard headers any HTTP

client sends. No account, no fingerprint, no telemetry. Installing an

update downloads the signed installer from GitHub when you tap install.



\*\*4. yt-dlp update checks.\*\* On launch, RuForge checks GitHub's API

(every 12 hours, cached) for a newer version of the bundled yt-dlp

binary. The request includes a User-Agent identifying RuForge and its

version. If you tap "Update yt-dlp," the new binary downloads from

GitHub. No upload, no install without your tap.



\*\*5. Links you click.\*\* GitHub, Discord (if added), or any other link

opens in your default browser like any other link.



\## Domains RuForge contacts automatically



\- `raw.githubusercontent.com` — app update manifest, once per launch

\- `api.github.com` — yt-dlp release check, every 12 hours

\- `github.com` — release downloads when you tap install

\- `sponsor.ajay.app` — SponsorBlock segments when enabled



Everything else on the network is initiated by you: yt-dlp connecting

to a site you queued, or the in-app browser loading a page you opened.



\## What RuForge does not do



\- We do not collect or report any data about your downloads, browsing,

&#x20; or playback. yt-dlp and the embedded browser still connect to the

&#x20; sites you use, the same way any browser or downloader does.

\- No analytics. No event tracking. No crash reporting back to us.

\- No account. No login. No cloud sync.

\- No ads. No referral injections. No affiliate rewrites of URLs.

\- No background uploading of files, library data, or watch history.



\## Network exceptions worth knowing



\- The Windows installer is signed. Windows SmartScreen may check the

&#x20; signature against Microsoft's reputation service when you run the

&#x20; installer. That check is between your computer and Microsoft, not us.

\- The embedded webview uses Microsoft Edge WebView2. When you log into a

&#x20; site through the in-app browser, that site sees the same data it

&#x20; would see in normal Edge: your IP, cookies, headers. RuForge does not

&#x20; add or remove anything from those requests.



\## Logs and crash data



RuForge does not collect crash data. If you hit a bug and open a GitHub

issue, you can attach logs manually. You control what gets shared.



\## Children



RuForge is not directed at children. It is a general-purpose desktop

tool.



\## Changes



If this page changes in a way that affects what data leaves your

machine, the change ships with a release and shows in the in-app

changelog.



\## Contact



Open an issue at https://github.com/UnboundAngel/RuForge/issues.

