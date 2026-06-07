/** Probe embedded Explorer for signed-in YouTube account; emits `explorer-youtube-profile`. */
export const EXPLORER_YOUTUBE_PROFILE_EVENT = "explorer-youtube-profile";

/** Label for the embedded music.youtube.com child webview created by MusicShell. */
export const MUSIC_EXPLORE_WEBVIEW_LABEL = "music-explore-view";

export type ExplorerYouTubeProfilePayload = {
  displayName: string;
  /** Omitted when the probe has no avatar — listener must not clear an existing URL. */
  avatarUrl?: string | null;
} | null;

const PROFILE_EVENT = JSON.stringify(EXPLORER_YOUTUBE_PROFILE_EVENT);

/**
 * Emits a Tauri event using __TAURI_INTERNALS__ (always present in Tauri v2 child
 * webviews, even on external URLs like music.youtube.com) with a fallback to the
 * legacy window.__TAURI__.event API (only available when withGlobalTauri is set).
 *
 * Usage: inline `${tauriEmitHelperCode()}` at the top of any injected IIFE, then
 * call `__rf_tauri_emit(eventName, payload)` or check `if (!__rf_tauri_emit) return;`.
 */
function tauriEmitHelperCode(): string {
  return `var __rf_tauri_emit = (function() {
    try {
      var _ti = window.__TAURI_INTERNALS__;
      if (_ti && typeof _ti.invoke === 'function') {
        return function(ev, pl) {
          _ti.invoke('plugin:event|emit', { event: ev, payload: pl, target: { kind: 'Any' } });
        };
      }
    } catch (_e) {}
    try {
      var _te = window.__TAURI__ && window.__TAURI__.event;
      if (_te && typeof _te.emit === 'function') {
        return function(ev, pl) { _te.emit(ev, pl); };
      }
    } catch (_e2) {}
    return null;
  })();`;
}

/** youtube.com topbar avatar button (visible when signed in). */
function profileDomFromYouTubeTopbarJs(): string {
  return `
        var avatarImg = null;
        var avatarBtn = null;
        try {
          avatarBtn = document.querySelector(
            "#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn, ytd-topbar-menu-button-renderer button, button[aria-label*='Google Account'], button[aria-label*='Account menu']"
          );
          avatarImg = document.querySelector(
            "#avatar-btn img, ytd-topbar-menu-button-renderer #avatar-btn img, ytd-topbar-menu-button-renderer img.yt-img-shadow, ytd-topbar-menu-button-renderer .yt-spec-avatar-shape img, .yt-spec-avatar-shape img"
          );
        } catch (e) {}
        var name = null;
        try {
          if (avatarBtn) {
            var label = avatarBtn.getAttribute("aria-label") || "";
            var m = label.match(/Google Account:\\s*(.+)/i);
            if (m && m[1]) name = m[1].trim();
            else if (label && !/^(Account menu|Google Account)$/i.test(label.trim())) {
              name = label.trim();
            }
          }
        } catch (e2) {}
        var avatarUrl = avatarImg && avatarImg.src ? avatarImg.src : null;
        return { name: name, avatarUrl: avatarUrl };
  `;
}

/** Shared ytInitialData topbar scrape (youtube.com + music.youtube.com). */
function profileTopbarFromYtInitialDataJs(): string {
  return `
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
        return { name: name, avatarUrl: avatarUrl };
  `;
}

function musicProfileProbeInner(): string {
  return `
    try {
      if (!__rf_tauri_emit) return;
      var emit = function(payload) {
        __rf_tauri_emit(${PROFILE_EVENT}, payload);
      };
      var scrapeTopbar = function() {
        return (function() {${profileTopbarFromYtInitialDataJs()}})();
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
      var scraped = scrapeTopbar();
      if (scraped.avatarUrl) {
        emit({
          displayName: scraped.name || "Your channel",
          avatarUrl: scraped.avatarUrl
        });
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
        emit({ displayName: scraped.name || "Your channel" });
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
      if (!__rf_tauri_emit) return;
      var emit = function(payload) {
        __rf_tauri_emit(${PROFILE_EVENT}, payload);
      };
      var scrapeTopbar = function() {
        return (function() {${profileTopbarFromYtInitialDataJs()}})();
      };
      var scrapeDom = function() {
        return (function() {${profileDomFromYouTubeTopbarJs()}})();
      };
      var dom = scrapeDom();
      if (dom.avatarUrl) {
        var tbDom = scrapeTopbar();
        emit({
          displayName: dom.name || tbDom.name || "Your channel",
          avatarUrl: dom.avatarUrl
        });
        return;
      }
      var signIn = null;
      try {
        signIn = document.querySelector(
          "ytd-sign-in-button, a[href*='accounts.google.com/ServiceLogin'], tp-yt-paper-button[aria-label*='Sign in']"
        );
      } catch (e) {}
      if (signIn && !document.querySelector("#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn")) {
        emit(null);
        return;
      }
      var scraped = scrapeTopbar();
      if (scraped.avatarUrl) {
        emit({
          displayName: scraped.name || dom.name || "Your channel",
          avatarUrl: scraped.avatarUrl
        });
        return;
      }
      var loggedIn = false;
      var loggedOut = false;
      try {
        var cfg = window.ytcfg && window.ytcfg.get && window.ytcfg.get("LOGGED_IN");
        if (cfg === true) loggedIn = true;
        if (cfg === false) loggedOut = true;
      } catch (e) {}
      if (loggedIn || dom.name) {
        emit({ displayName: scraped.name || dom.name || "Your channel" });
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

export const EXPLORER_PROFILE_PROBE_SCRIPT = `(function(){
  ${tauriEmitHelperCode()}
  ${explorerProfileProbeInner()}
})();`;

/** Injected once into explorer-view: re-probe on navigation and while the tab is open. */
export const EXPLORER_PROFILE_PROBE_INSTALL = `(function(){
  if (window.__rf_ex_profile__) return;
  window.__rf_ex_profile__ = true;
  ${tauriEmitHelperCode()}
  function probeProfile() {${explorerProfileProbeInner()}}
  if (!window.__rf_ex_profile_ready) {
    window.__rf_ex_profile_ready = true;
    window.addEventListener("yt-navigate-finish", function() { probeProfile(); });
  }
  probeProfile();
  setInterval(probeProfile, 2000);
})();`;

export const MUSIC_EXPLORE_PROFILE_PROBE_SCRIPT = `(function(){
  ${tauriEmitHelperCode()}
  ${musicProfileProbeInner()}
})();`;

/** Emitted by the injected script when the active YTM track changes. */
export const MUSIC_EXPLORE_NOW_PLAYING_EVENT = "music-explore-now-playing";

/** Emitted on navigation with page kind, title, and playlist URL hints for the bottom bar. */
export const MUSIC_EXPLORE_PAGE_CONTEXT_EVENT = "music-explore-page-context";

/** Page-context probe — safe to re-inject whenever the explore webview is shown. */
export const MUSIC_EXPLORE_PAGE_CONTEXT_INSTALL = `(function(){
  ${tauriEmitHelperCode()}
  if (!__rf_tauri_emit) return;
  function parseDurationText(text) {
    if (!text) return null;
    var trimmed = String(text).trim();
    if (!trimmed) return null;
    if (/^\\d+[\\d,]*\\s*(?:plays|views|listeners)/i.test(trimmed)) return null;
    var parts = trimmed.split(":").map(function(p) { return parseInt(p, 10); });
    if (parts.some(function(n) { return isNaN(n); })) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return null;
  }
  function parseHeaderTrackCountFromRuns(runs) {
    if (!runs || !runs.length) return null;
    for (var i = 0; i < runs.length; i++) {
      var m = String(runs[i].text || "").match(/([\\d][\\d,]*)\\s+songs?/i);
      if (m) return parseInt(m[1].replace(/,/g, ""), 10);
    }
    return null;
  }
  function parseHeaderTrackCount(data) {
    try {
      var twoCol = data && data.contents && data.contents.twoColumnBrowseResultsRenderer;
      if (!twoCol) return null;
      var tabContents = twoCol.tabs && twoCol.tabs[0] && twoCol.tabs[0].tabRenderer
        && twoCol.tabs[0].tabRenderer.content && twoCol.tabs[0].tabRenderer.content.sectionListRenderer
        && twoCol.tabs[0].tabRenderer.content.sectionListRenderer.contents;
      if (tabContents && tabContents[0] && tabContents[0].musicResponsiveHeaderRenderer) {
        var runs = tabContents[0].musicResponsiveHeaderRenderer.secondSubtitle
          && tabContents[0].musicResponsiveHeaderRenderer.secondSubtitle.runs;
        var fromTab = parseHeaderTrackCountFromRuns(runs);
        if (fromTab != null) return fromTab;
      }
      var secContents = twoCol.secondaryContents && twoCol.secondaryContents.sectionListRenderer
        && twoCol.secondaryContents.sectionListRenderer.contents;
      if (secContents) {
        for (var hi = 0; hi < secContents.length; hi++) {
          var block = secContents[hi];
          if (block.musicResponsiveHeaderRenderer) {
            var hr = block.musicResponsiveHeaderRenderer.secondSubtitle
              && block.musicResponsiveHeaderRenderer.secondSubtitle.runs;
            var fromSec = parseHeaderTrackCountFromRuns(hr);
            if (fromSec != null) return fromSec;
          }
          if (block.musicPlaylistHeaderRenderer) {
            var pr = block.musicPlaylistHeaderRenderer.secondSubtitle
              && block.musicPlaylistHeaderRenderer.secondSubtitle.runs;
            var fromPl = parseHeaderTrackCountFromRuns(pr);
            if (fromPl != null) return fromPl;
          }
        }
      }
    } catch (e) {}
    return null;
  }
  function findTrackShelf(data) {
    if (!data || !data.contents) return null;
    var twoCol = data.contents.twoColumnBrowseResultsRenderer;
    if (!twoCol) return null;
    var secList = twoCol.secondaryContents && twoCol.secondaryContents.sectionListRenderer;
    if (secList && secList.contents) {
      for (var si = 0; si < secList.contents.length; si++) {
        var secBlock = secList.contents[si];
        if (secBlock.musicShelfRenderer) {
          return { kind: "musicShelfRenderer", shelf: secBlock.musicShelfRenderer };
        }
        if (secBlock.musicPlaylistShelfRenderer) {
          return { kind: "musicPlaylistShelfRenderer", shelf: secBlock.musicPlaylistShelfRenderer };
        }
      }
    }
    var tabs = twoCol.tabs;
    if (tabs && tabs[0] && tabs[0].tabRenderer && tabs[0].tabRenderer.content) {
      var tabList = tabs[0].tabRenderer.content.sectionListRenderer;
      if (tabList && tabList.contents) {
        for (var ti = 0; ti < tabList.contents.length; ti++) {
          var tabBlock = tabList.contents[ti];
          if (tabBlock.musicShelfRenderer) {
            return { kind: "musicShelfRenderer", shelf: tabBlock.musicShelfRenderer };
          }
          if (tabBlock.musicPlaylistShelfRenderer) {
            return { kind: "musicPlaylistShelfRenderer", shelf: tabBlock.musicPlaylistShelfRenderer };
          }
        }
      }
    }
    return null;
  }
  function parseTrackRow(entry, isAlbum) {
    if (!entry || entry.continuationItemRenderer) return null;
    var row = entry.musicResponsiveListItemRenderer;
    if (!row || !row.flexColumns || !row.flexColumns.length) return null;
    var flex0 = row.flexColumns[0] && row.flexColumns[0].musicResponsiveListItemFlexColumnRenderer;
    var runs0 = flex0 && flex0.text && flex0.text.runs && flex0.text.runs[0];
    if (!runs0) return null;
    var videoId = runs0.navigationEndpoint && runs0.navigationEndpoint.watchEndpoint
      && runs0.navigationEndpoint.watchEndpoint.videoId;
    var title = runs0.text;
    if (!videoId || !title) return null;
    var artist = null;
    if (row.flexColumns[1]) {
      var flex1 = row.flexColumns[1].musicResponsiveListItemFlexColumnRenderer;
      if (flex1 && flex1.text && flex1.text.runs && flex1.text.runs[0]) {
        artist = flex1.text.runs[0].text || null;
      }
    }
    var durationSeconds = null;
    if (row.fixedColumns && row.fixedColumns[0]) {
      var fixed0 = row.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer;
      if (fixed0 && fixed0.text && fixed0.text.simpleText) {
        durationSeconds = parseDurationText(fixed0.text.simpleText);
      }
    }
    if (durationSeconds == null && isAlbum && row.flexColumns.length > 2) {
      for (var fi = 2; fi < row.flexColumns.length; fi++) {
        var flexN = row.flexColumns[fi].musicResponsiveListItemFlexColumnRenderer;
        var runN = flexN && flexN.text && flexN.text.runs && flexN.text.runs[0];
        if (runN && runN.text) {
          var parsed = parseDurationText(runN.text);
          if (parsed != null) {
            durationSeconds = parsed;
            break;
          }
        }
      }
    }
    var thumbnail = null;
    try {
      var thumbs = row.thumbnail && row.thumbnail.musicThumbnailRenderer
        && row.thumbnail.musicThumbnailRenderer.thumbnail
        && row.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails;
      if (thumbs && thumbs.length) thumbnail = thumbs[thumbs.length - 1].url || null;
    } catch (e2) {}
    return {
      videoId: videoId,
      title: String(title).trim(),
      durationSeconds: durationSeconds,
      artist: artist,
      thumbnail: thumbnail
    };
  }
  function readHarvestedTracklist(playlistUrl, browseTargetUrl) {
    try {
      var browseEl = document.querySelector("ytmusic-browse-response");
      var data = browseEl && browseEl.data;
      if (!data || !data.contents) return null;
      var found = findTrackShelf(data);
      if (!found || !found.shelf || !found.shelf.contents) return null;
      var contents = found.shelf.contents;
      var hasContinuation = false;
      if (contents.length && contents[contents.length - 1].continuationItemRenderer) {
        hasContinuation = true;
      }
      var isAlbum = found.kind === "musicShelfRenderer";
      var tracks = [];
      var seen = {};
      for (var ri = 0; ri < contents.length; ri++) {
        if (contents[ri].continuationItemRenderer) continue;
        var parsed = parseTrackRow(contents[ri], isAlbum);
        if (!parsed || seen[parsed.videoId]) continue;
        seen[parsed.videoId] = true;
        tracks.push(parsed);
      }
      if (!tracks.length) return null;
      return {
        harvestSourceUrl: window.location.href.split("#")[0],
        playlistUrl: playlistUrl || null,
        browseTargetUrl: browseTargetUrl || null,
        shelfKind: found.kind,
        headerTrackCount: parseHeaderTrackCount(data),
        hasContinuation: hasContinuation,
        tracks: tracks
      };
    } catch (e) {}
    return null;
  }
  function readPageContext() {
    var href = window.location.href;
    var path = (window.location.pathname || "/").replace(/\\/+$/, "") || "/";
    var kind = "other";
    var pageTitle = null;
    var playlistUrl = null;
    var isPlaylistPage = false;
    var browseTargetUrl = null;
    var shelfLinks = [];

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
      if (kind === "album" || (kind === "browse" && pageTitle)) {
        var plAnchors = document.querySelectorAll(
          'a[href*="/playlist?list=OLAK"], a[href*="/playlist?list=VL"], ytmusic-detail-header-renderer a[href*="list="]'
        );
        for (var pi = 0; pi < plAnchors.length; pi++) {
          var ph = plAnchors[pi].href || "";
          var pm = ph.match(/[?&]list=([^&]+)/);
          if (pm && pm[1] && (pm[1].indexOf("OLAK") === 0 || pm[1].indexOf("VL") === 0 || pm[1].indexOf("PL") === 0)) {
            playlistUrl = "https://music.youtube.com/playlist?list=" + pm[1];
            isPlaylistPage = true;
            kind = "album";
            break;
          }
        }
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

    try {
      var shelfAnchors = document.querySelectorAll(
        'ytmusic-carousel a[href*="/browse/"], ytmusic-carousel a[href*="/playlist?list="], ' +
        'ytmusic-shelf-renderer a[href*="/browse/"], ytmusic-shelf-renderer a[href*="/playlist?list="], ' +
        'ytmusic-browse a[href*="/browse/MP"], ytmusic-browse a[href*="/playlist?list="]'
      );
      var seenShelf = {};
      for (var si = 0; si < shelfAnchors.length; si++) {
        var sh = (shelfAnchors[si].href || "").split("#")[0];
        if (!sh || seenShelf[sh]) continue;
        if (sh.indexOf("/browse/MP") < 0 && sh.indexOf("list=OLAK") < 0 && sh.indexOf("list=PL") < 0 && sh.indexOf("list=VL") < 0) continue;
        seenShelf[sh] = true;
        var st = "";
        try {
          var card = shelfAnchors[si].closest("ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer");
          if (card) {
            var te = card.querySelector(".title, yt-formatted-string.title, .text");
            if (te) st = (te.textContent || "").trim();
          }
        } catch (e2) {}
        shelfLinks.push({ title: st || sh, url: sh });
        if (shelfLinks.length >= 50) break;
      }
    } catch (e) {}

    if (path.indexOf("/browse/MP") === 0) {
      browseTargetUrl = href.split("#")[0];
    } else if (kind === "artist" || kind === "channel") {
      if (path.indexOf("/browse/MP") === 0) browseTargetUrl = href.split("#")[0];
    } else if (kind === "album" || kind === "browse") {
      browseTargetUrl = href.split("#")[0];
    }

    var harvestedTracklist = readHarvestedTracklist(playlistUrl, browseTargetUrl);

    return {
      url: href,
      kind: kind,
      pageTitle: pageTitle,
      playlistUrl: playlistUrl,
      isPlaylistPage: isPlaylistPage,
      browseTargetUrl: browseTargetUrl,
      shelfLinks: shelfLinks,
      harvestedTracklist: harvestedTracklist
    };
  }
  function browseDataHasTrackShelf() {
    try {
      var browseEl = document.querySelector("ytmusic-browse-response");
      var data = browseEl && browseEl.data;
      if (!data || !data.contents) return false;
      var found = findTrackShelf(data);
      return !!(found && found.shelf && found.shelf.contents && found.shelf.contents.length);
    } catch (e) {}
    return false;
  }
  function clearBrowseDataWatcher() {
    if (window.__rf_browse_poll) {
      clearInterval(window.__rf_browse_poll);
      window.__rf_browse_poll = null;
    }
  }
  function armBrowseDataWatcher() {
    clearBrowseDataWatcher();
    if (browseDataHasTrackShelf()) {
      window.__rf_emitPageContext();
      return;
    }
    var started = Date.now();
    var maxMs = 4000;
    var intervalMs = 100;
    window.__rf_browse_poll = setInterval(function() {
      if (browseDataHasTrackShelf()) {
        clearBrowseDataWatcher();
        window.__rf_emitPageContext();
        return;
      }
      if (Date.now() - started >= maxMs) {
        clearBrowseDataWatcher();
      }
    }, intervalMs);
  }
  function emitPageContext() {
    try {
      var ctx = readPageContext();
      var shelfKey = "";
      try { shelfKey = JSON.stringify(ctx.shelfLinks || []); } catch (e) { shelfKey = ""; }
      var harvestKey = "";
      try {
        harvestKey = ctx.harvestedTracklist
          ? ctx.harvestedTracklist.tracks.length + "|" + (ctx.harvestedTracklist.headerTrackCount || "")
            + "|" + (ctx.harvestedTracklist.hasContinuation ? "c" : "")
            + "|" + (ctx.harvestedTracklist.tracks[0] && ctx.harvestedTracklist.tracks[0].videoId || "")
          : "";
      } catch (e2) { harvestKey = ""; }
      var key = ctx.kind + "|" + ctx.url + "|" + (ctx.playlistUrl || "") + "|" + (ctx.pageTitle || "") + "|" + (ctx.browseTargetUrl || "") + "|" + shelfKey + "|" + harvestKey;
      if (window.__rf_last_ctx === key) return;
      window.__rf_last_ctx = key;
      __rf_tauri_emit("music-explore-page-context", ctx);
    } catch (e) {}
  }
  function refreshBrowseContext() {
    window.__rf_emitPageContext();
    armBrowseDataWatcher();
  }
  window.__rf_emitPageContext = emitPageContext;
  window.__rf_refreshBrowseContext = refreshBrowseContext;
  if (!window.__rf_ctx_ready) {
    window.__rf_ctx_ready = true;
    window.addEventListener("yt-navigate-finish", function(){ refreshBrowseContext(); });
  }
  refreshBrowseContext();
})();`;

/** Now-playing probe — safe to re-inject whenever the explore webview is shown. */
export const MUSIC_EXPLORE_NOW_PLAYING_INSTALL = `(function(){
  ${tauriEmitHelperCode()}
  if (!__rf_tauri_emit) return;
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
    try {
      if (!np.videoId) return;
      if (window.__rf_last_vid === np.videoId) return;
      window.__rf_last_vid = np.videoId;
      __rf_tauri_emit("music-explore-now-playing", np);
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
  ${tauriEmitHelperCode()}
  function emitUrl() {
    if (__rf_tauri_emit) {
      __rf_tauri_emit("music-explore-url", window.location.href);
    }
  }
  function probeProfile() {${musicProfileProbeInner()}}
  function tick(onNavigateFinish) {
    emitUrl();
    probeProfile();
    if (window.__rf_emitNowPlaying) window.__rf_emitNowPlaying();
    if (onNavigateFinish && window.__rf_refreshBrowseContext) {
      window.__rf_refreshBrowseContext();
    } else if (window.__rf_emitPageContext) {
      window.__rf_emitPageContext();
    }
  }
  tick(false);
  window.addEventListener("yt-navigate-finish", function() { tick(true); });
  setInterval(function() { tick(false); }, 2000);
})();`;
