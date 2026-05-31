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
  function tick() { emitUrl(); probeProfile(); }
  tick();
  window.addEventListener("yt-navigate-finish", tick);
  setInterval(tick, 2000);
})();`;
