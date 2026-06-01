/** Probe embedded Explorer for signed-in YouTube account; emits `explorer-youtube-profile`. */
export const EXPLORER_YOUTUBE_PROFILE_EVENT = "explorer-youtube-profile";

/** Label for the embedded music.youtube.com child webview created by MusicShell. */
export const MUSIC_EXPLORE_WEBVIEW_LABEL = "music-explore-view";

export type ExplorerYouTubeProfilePayload = {
  displayName: string;
  avatarUrl: string | null;
} | null;

const PROFILE_EVENT = JSON.stringify(EXPLORER_YOUTUBE_PROFILE_EVENT);

function musicProfileProbeInner(): string {
  return `
    try {
      if (!window.__TAURI__ || !window.__TAURI__.event) return;
      var emit = function(payload) {
        window.__TAURI__.event.emit(${PROFILE_EVENT}, payload);
      };
      var avatarImg = null;
      var avatarBtn = null;
      try {
        avatarBtn = document.querySelector(
          "ytmusic-nav-bar #avatar-btn, #avatar-btn, ytmusic-app #avatar-btn"
        );
        avatarImg = document.querySelector(
          "ytmusic-nav-bar #avatar-btn img, #avatar-btn img, ytmusic-app #avatar-btn img, .yt-spec-avatar-shape img"
        );
      } catch (e) {}
      if (avatarImg && avatarImg.src) {
        var name = "";
        try {
          if (avatarBtn && avatarBtn.getAttribute("aria-label")) {
            name = avatarBtn.getAttribute("aria-label");
          }
        } catch (e) {}
        emit({ displayName: name || "Your channel", avatarUrl: avatarImg.src });
        return;
      }
      var signIn = null;
      try {
        signIn = document.querySelector(
          "ytmusic-sign-in-button, ytmusic-app ytmusic-sign-in-button, a[href*='accounts.google.com']"
        );
      } catch (e) {}
      if (signIn) {
        emit(null);
        return;
      }
      var loggedIn = false;
      var loggedOut = false;
      try {
        var cfg = window.ytcfg && window.ytcfg.get && window.ytcfg.get("LOGGED_IN");
        if (cfg === true) loggedIn = true;
        if (cfg === false) loggedOut = true;
      } catch (e) {}
      if (loggedIn) {
        emit({ displayName: "Your channel", avatarUrl: null });
        return;
      }
      if (loggedOut && signIn) {
        emit(null);
      }
    } catch (e) {}
  `;
}

function explorerProfileProbeInner(): string {
  return `
    try {
      if (!window.__TAURI__ || !window.__TAURI__.event) return;
      var emit = function(payload) {
        window.__TAURI__.event.emit(${PROFILE_EVENT}, payload);
      };
      var loggedIn = false;
      var loggedOut = false;
      try {
        var cfg = window.ytcfg && window.ytcfg.get && window.ytcfg.get("LOGGED_IN");
        if (cfg === true) loggedIn = true;
        if (cfg === false) loggedOut = true;
      } catch (e) {}
      if (loggedIn) {
        var name = null;
        var avatarUrl = null;
        var data = window.ytInitialData;
        var tb = data && data.response && data.response.topbar && data.response.topbar.desktopTopbarRenderer;
        if (tb) {
          var avatarBtn = tb.avatarButton && tb.avatarButton.avatarButtonRenderer;
          if (avatarBtn && avatarBtn.image && avatarBtn.image.thumbnails && avatarBtn.image.thumbnails.length) {
            avatarUrl = avatarBtn.image.thumbnails[avatarBtn.image.thumbnails.length - 1].url;
          }
          var entry = tb.interactiveAccountEntryPointRenderer;
          if (entry && entry.buttonRenderer && entry.buttonRenderer.avatar && entry.buttonRenderer.avatar.avatarRenderer) {
            var avR = entry.buttonRenderer.avatar.avatarRenderer;
            if (avR.image && avR.image.thumbnails && avR.image.thumbnails.length) {
              avatarUrl = avR.image.thumbnails[avR.image.thumbnails.length - 1].url;
            }
          }
          var menu = tb.accountMenu && tb.accountMenu.accountMenuRenderer;
          if (menu && menu.header && menu.header.accountSectionListRenderer) {
            var contents = menu.header.accountSectionListRenderer.contents;
            if (contents && contents[0]) {
              var section = contents[0].accountSection && contents[0].accountSection.accountItemSectionRenderer;
              if (section && section.contents && section.contents[0]) {
                var item = section.contents[0].accountItem && section.contents[0].accountItem.accountItemRenderer;
                if (item) {
                  if (item.accountName && item.accountName.simpleText) name = item.accountName.simpleText;
                  if (item.accountPhoto && item.accountPhoto.thumbnails && item.accountPhoto.thumbnails.length) {
                    avatarUrl = item.accountPhoto.thumbnails[item.accountPhoto.thumbnails.length - 1].url;
                  }
                }
              }
            }
          }
        }
        emit({ displayName: name || "Your channel", avatarUrl: avatarUrl });
        return;
      }
      if (loggedOut) {
        var data2 = window.ytInitialData;
        var tb2 = data2 && data2.response && data2.response.topbar && data2.response.topbar.desktopTopbarRenderer;
        if (tb2 && tb2.signInButton && !tb2.avatarButton) { emit(null); return; }
      }
    } catch (e) {}
  `;
}

export const EXPLORER_PROFILE_PROBE_SCRIPT = `(function(){${explorerProfileProbeInner()}})();`;
export const MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT = `(function(){${musicProfileProbeInner()}})();`;

/** Emitted by the injected script when the active YTM track changes. */
export const MUSIC_EXPLORE_NOW_PLAYING_EVENT = "music-explore-now-playing";

/** Emitted on navigation with page kind, title, and playlist URL hints for the bottom bar. */
export const MUSIC_EXPLORE_PAGE_CONTEXT_EVENT = "music-explore-page-context";

/** Page-context probe — safe to re-inject whenever the explore webview is shown. */
export const MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL = `(function(){
  if (!window.__TAURI__ || !window.__TAURI__.event) return;
  function readPageContext() {
    var href = window.location.href;
    var path = (window.location.pathname || "/").replace(/\\/+$/, "") || "/";
    var kind = "other";
    var pageTitle = null;
    var playlistUrl = null;
    var isPlaylistPage = false;

    if (path === "" || path === "/") kind = "home";
    else if (path.indexOf("/search") === 0) kind = "search";
    else if (path.indexOf("/library") === 0) kind = "library";
    else if (path.indexOf("/watch") === 0) {
      var listParam = new URLSearchParams(window.location.search).get("list");
      if (listParam) {
        kind = "playlist";
        playlistUrl = "https://music.youtube.com/playlist?list=" + listParam;
        isPlaylistPage = true;
      } else kind = "watch";
    }
    else if (path.indexOf("/playlist") === 0) {
      kind = "playlist";
      isPlaylistPage = true;
      if (/[?&]list=/.test(window.location.search)) playlistUrl = href.split("#")[0];
    }
    else if (path.indexOf("/channel") === 0) kind = "channel";
    else if (path.indexOf("/@") === 0) kind = "artist";
    else if (path.indexOf("/browse") === 0) kind = "browse";

    try {
      var header = document.querySelector("ytmusic-detail-header-renderer");
      if (header) {
        var titleEl = header.querySelector(".title, h2, yt-formatted-string.title");
        if (titleEl) pageTitle = (titleEl.textContent || "").trim() || null;
        var subEl = header.querySelector(".subtitle, .second-subtitle");
        var sub = subEl ? (subEl.textContent || "").toLowerCase() : "";
        if (sub.indexOf("playlist") >= 0) {
          kind = "playlist";
          isPlaylistPage = true;
        } else if (sub.indexOf("album") >= 0 && kind === "browse") kind = "album";
        else if (sub.indexOf("artist") >= 0 && kind === "browse") kind = "artist";
      }
    } catch (e) {}

    try {
      if (document.querySelector('[page-type="MUSIC_PAGE_TYPE_PLAYLIST"], ytmusic-playlist-header-renderer')) {
        kind = "playlist";
        isPlaylistPage = true;
      }
    } catch (e) {}

    if (kind === "other") {
      try {
        var plLinks = document.querySelectorAll('a[href*="list="]');
        for (var i = 0; i < plLinks.length; i++) {
          var lh = plLinks[i].href || "";
          var lm = lh.match(/[?&]list=([^&]+)/);
          if (lm && lm[1] && lm[1].length > 10) {
            kind = "playlist";
            isPlaylistPage = true;
            playlistUrl = "https://music.youtube.com/playlist?list=" + lm[1];
            break;
          }
        }
      } catch (e) {}
    }

    return {
      url: href,
      kind: kind,
      pageTitle: pageTitle,
      playlistUrl: playlistUrl,
      isPlaylistPage: isPlaylistPage
    };
  }
  function emitPageContext() {
    if (!window.__TAURI__ || !window.__TAURI__.event) return;
    try {
      var ctx = readPageContext();
      var key = ctx.kind + "|" + ctx.url + "|" + (ctx.playlistUrl || "") + "|" + (ctx.pageTitle || "");
      if (window.__rf_last_ctx === key) return;
      window.__rf_last_ctx = key;
      window.__TAURI__.event.emit("music-explore-page-context", ctx);
    } catch (e) {}
  }
  window.__rf_emitPageContext = emitPageContext;
  if (!window.__rf_ctx_ready) {
    window.__rf_ctx_ready = true;
    window.addEventListener("yt-navigate-finish", function(){ window.__rf_emitPageContext(); });
  }
  window.__rf_emitPageContext();
})();`;

/** Now-playing probe — safe to re-inject whenever the explore webview is shown. */
export const MUSIC_EXPLORE_NOW_PLAYING_INSTALL = `(function(){
  if (!window.__TAURI__ || !window.__TAURI__.event) return;
  window.__rf_last_vid = window.__rf_last_vid || null;
  function readNowPlaying() {
    var videoId = null, title = null, artist = null;
    try {
      var player = document.getElementById("movie_player");
      if (player) {
        var adShowing = player.classList.contains("ad-showing")
          || player.classList.contains("ad-interrupting")
          || !!document.querySelector(".ytp-ad-player-overlay-interrupt, .ytp-ad-preview-container");
        if (adShowing) {
          window.__rf_last_vid = null;
          return { videoId: null, title: null, artist: null };
        }
        if (typeof player.getVideoData === "function") {
          var data = player.getVideoData();
          if (data && data.video_id) {
            videoId = data.video_id;
            title = data.title || null;
            artist = data.author || null;
          }
        }
      }
    } catch (e) {}
    if (!videoId) {
      try {
        var links = document.querySelectorAll('ytmusic-player-bar a[href*="watch"], ytmusic-player-bar a[href*="v="]');
        for (var i = 0; i < links.length; i++) {
          var lm = (links[i].href || "").match(/[?&]v=([A-Za-z0-9_-]{11})/);
          if (lm) { videoId = lm[1]; break; }
        }
      } catch (e) {}
    }
    if (!videoId) {
      try {
        var page = document.querySelector("ytmusic-player-page");
        var resp = page && (page.playerResponse || page.data);
        if (resp && resp.videoDetails && resp.videoDetails.videoId) {
          videoId = resp.videoDetails.videoId;
          title = resp.videoDetails.title || null;
          artist = resp.videoDetails.author || null;
        }
      } catch (e) {}
    }
    if (videoId && !title) {
      try {
        var titleEl = document.querySelector("ytmusic-player-bar .title, ytmusic-player-bar .byline");
        if (titleEl) title = (titleEl.textContent || "").trim() || null;
      } catch (e) {}
    }
    if (!videoId) {
      var um = window.location.href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (um) videoId = um[1];
    }
    return { videoId: videoId, title: title, artist: artist };
  }
  function emitNowPlayingWith(np) {
    if (!window.__TAURI__ || !window.__TAURI__.event) return;
    try {
      if (!np.videoId) return;
      if (window.__rf_last_vid === np.videoId) return;
      window.__rf_last_vid = np.videoId;
      window.__TAURI__.event.emit("music-explore-now-playing", np);
    } catch (e) {}
  }
  function emitNowPlaying() {
    try { emitNowPlayingWith(readNowPlaying()); } catch (e) {}
  }
  function tryEmitNowPlaying(retries) {
    var np = readNowPlaying();
    if (!np.videoId && retries > 0) {
      setTimeout(function(){ tryEmitNowPlaying(retries - 1); }, 800);
      return;
    }
    if (np.videoId) emitNowPlayingWith(np);
  }
  window.__rf_emitNowPlaying = emitNowPlaying;
  if (!window.__rf_np_ready) {
    window.__rf_np_ready = true;
    window.addEventListener("yt-navigate-finish", function(){
      window.__rf_last_vid = null;
      window.__rf_emitNowPlaying();
    });
    window.addEventListener("yt-player-updated", function(){
      setTimeout(function(){ window.__rf_emitNowPlaying(); }, 100);
    });
    document.addEventListener("play", function(){
      setTimeout(function(){ tryEmitNowPlaying(2); }, 400);
    }, true);
  }
  window.__rf_emitNowPlaying();
})();`;

/** Injected into music-explore-view: URL bridge + profile re-probe on navigation. */
export const MUSIC_EXPLORE_INIT_SCRIPT = `(function(){
  if (window.__rf_mu__) return;
  window.__rf_mu__ = true;
  function emitUrl() {
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit("music-explore-url", window.location.href);
    }
  }
  function probeProfile() {${musicProfileProbeInner()}}
  function tick() {
    emitUrl();
    probeProfile();
    if (window.__rf_emitNowPlaying) window.__rf_emitNowPlaying();
    if (window.__rf_emitPageContext) window.__rf_emitPageContext();
  }
  tick();
  window.addEventListener("yt-navigate-finish", tick);
  setInterval(tick, 2000);
})();`;
