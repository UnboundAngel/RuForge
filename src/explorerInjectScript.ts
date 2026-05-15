/** Injected into the embedded YouTube Explorer webview (`explorer-view`). */
export type ExplorerInjectColors = {
  accent: string;
  borderRgba: string;
  glowRgba: string;
};

export function buildExplorerInjectScript(colors: ExplorerInjectColors): string {
  const accent = JSON.stringify(colors.accent);
  const borderRgba = JSON.stringify(colors.borderRgba);
  const glowRgba = JSON.stringify(colors.glowRgba);

  return `(function() {
    const ACCENT = ${accent};
    const BORDER_RGBA = ${borderRgba};
    const GLOW_RGBA = ${glowRgba};
    const CREAM = '#EDD79C';

    const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

    function extractYouTubeVideoId(input) {
      const trimmed = String(input || '').trim();
      if (!trimmed) return null;

      const short = trimmed.match(/(?:^|\\/\\/)(?:www\\.)?youtu\\.be\\/([a-zA-Z0-9_-]{11})/i);
      if (short && short[1] && YT_ID_RE.test(short[1])) return short[1];

      try {
        const url = new URL(trimmed.startsWith('http') ? trimmed : 'https://' + trimmed);
        const host = url.hostname.replace(/^www\\./i, '').toLowerCase();

        if (host === 'youtu.be') {
          const id = (url.pathname.replace(/^\\//, '').split('/')[0] || '');
          if (YT_ID_RE.test(id)) return id;
        }

        if (
          host === 'youtube.com' ||
          host === 'm.youtube.com' ||
          host === 'music.youtube.com'
        ) {
          const v = url.searchParams.get('v');
          if (v && YT_ID_RE.test(v)) return v;

          const pathMatch = url.pathname.match(/\\/(?:shorts|embed|live)\\/([a-zA-Z0-9_-]{11})/i);
          if (pathMatch && pathMatch[1] && YT_ID_RE.test(pathMatch[1])) return pathMatch[1];
        }
      } catch (_) {
        return null;
      }

      return null;
    }

    function canonicalYouTubeWatchUrl(input) {
      const id = extractYouTubeVideoId(input);
      return id ? 'https://www.youtube.com/watch?v=' + id : null;
    }

    function isWatchPageUrl(href) {
      return !!canonicalYouTubeWatchUrl(href);
    }

    function isVideoAreaTarget(node) {
      if (!node || typeof node.closest !== 'function') return false;
      return !!node.closest(
        '#movie_player, ytd-player, .html5-video-player, #player-container, video.html5-main-video, .ytp-chrome-bottom'
      );
    }

    function emit(eventName, payload) {
      if (window.__TAURI__ && window.__TAURI__.event && window.__TAURI__.event.emit) {
        window.__TAURI__.event.emit(eventName, payload);
      }
    }

    const style = document.createElement('style');
    style.innerHTML = [
      '#neotube-dl-btn { position: fixed; top: 24px; right: 24px; z-index: 2147483646; background: rgba(29, 22, 19, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid ' + BORDER_RGBA + '; border-radius: 999px; padding: 14px 28px; display: flex; align-items: center; gap: 18px; cursor: pointer; transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); box-shadow: 0 15px 45px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1); opacity: 0; transform: translateY(-20px) scale(0.9); pointer-events: none; user-select: none; font-family: system-ui, -apple-system, sans-serif; }',
      '#neotube-dl-btn.visible { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }',
      '#neotube-dl-btn:hover { background: ' + ACCENT + '; border-color: ' + ACCENT + '; transform: translateY(-2px) scale(1.02); box-shadow: 0 20px 50px ' + GLOW_RGBA + '; }',
      '#neotube-dl-btn .text-group { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }',
      '#neotube-dl-btn .main-text { color: ' + ACCENT + '; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; transition: color 0.3s; }',
      '#neotube-dl-btn .sub-text { color: rgba(255, 255, 255, 0.4); font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em; transition: color 0.3s; }',
      '#neotube-dl-btn .icon { color: ' + ACCENT + '; width: 22px; height: 22px; transition: transform 0.3s, color 0.3s; }',
      '#neotube-dl-btn:hover .main-text { color: #1d1613; }',
      '#neotube-dl-btn:hover .sub-text { color: rgba(29, 22, 19, 0.6); }',
      '#neotube-dl-btn:hover .icon { color: #1d1613; transform: translateY(2px); }',
      '#ruforge-ctx-menu { position: fixed; z-index: 2147483647; min-width: 220px; padding: 6px; border-radius: 12px; background: rgba(39, 28, 24, 0.96); border: 1px solid ' + BORDER_RGBA + '; box-shadow: 0 18px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); font-family: system-ui, -apple-system, sans-serif; display: none; user-select: none; }',
      '#ruforge-ctx-menu.open { display: block; }',
      '#ruforge-ctx-menu .rf-item { width: 100%; text-align: left; border: 0; background: transparent; color: ' + CREAM + '; font-size: 13px; font-weight: 600; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: background 0.15s, color 0.15s; }',
      '#ruforge-ctx-menu .rf-item:hover, #ruforge-ctx-menu .rf-item:focus { outline: none; background: ' + ACCENT + '; color: #1d1613; }',
      '#ruforge-ctx-menu .rf-sep { height: 1px; margin: 4px 8px; background: linear-gradient(90deg, transparent, rgba(237, 215, 156, 0.35), transparent); }'
    ].join(' ');
    document.head.appendChild(style);

    const btn = document.createElement('div');
    btn.id = 'neotube-dl-btn';
    btn.innerHTML = '<div class="text-group"><span class="main-text">Source Found</span><span class="sub-text">Direct Download</span></div><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    document.body.appendChild(btn);

    btn.onclick = function() {
      const watchUrl = canonicalYouTubeWatchUrl(window.location.href);
      if (!watchUrl) return;
      emit('manual-download-trigger', watchUrl);
      btn.classList.remove('visible');
    };

    const ctxMenu = document.createElement('div');
    ctxMenu.id = 'ruforge-ctx-menu';
    ctxMenu.setAttribute('role', 'menu');
    ctxMenu.innerHTML = [
      '<button type="button" class="rf-item" data-action="download">Download video</button>',
      '<button type="button" class="rf-item" data-action="send-downloader">Send to downloader</button>',
      '<div class="rf-sep" aria-hidden="true"></div>',
      '<button type="button" class="rf-item" data-action="copy-link">Copy link</button>',
      '<button type="button" class="rf-item" data-action="copy-id">Copy video ID</button>'
    ].join('');
    document.body.appendChild(ctxMenu);

    let ctxWatchUrl = null;

    function hideCtxMenu() {
      ctxMenu.classList.remove('open');
      ctxWatchUrl = null;
    }

    function showCtxMenu(x, y, watchUrl) {
      ctxWatchUrl = watchUrl;
      ctxMenu.classList.add('open');
      const pad = 8;
      const rect = ctxMenu.getBoundingClientRect();
      let left = x;
      let top = y;
      if (left + rect.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (top + rect.height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - rect.height - pad);
      }
      ctxMenu.style.left = left + 'px';
      ctxMenu.style.top = top + 'px';
    }

    ctxMenu.addEventListener('click', function(e) {
      const item = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (!item || !ctxWatchUrl) return;
      e.preventDefault();
      e.stopPropagation();
      const action = item.getAttribute('data-action');
      const id = extractYouTubeVideoId(ctxWatchUrl);
      if (action === 'download') {
        emit('manual-download-trigger', ctxWatchUrl);
        btn.classList.remove('visible');
      } else if (action === 'send-downloader') {
        emit('explorer-send-to-downloader', ctxWatchUrl);
      } else if (action === 'copy-link') {
        emit('explorer-copy-watch-url', ctxWatchUrl);
      } else if (action === 'copy-id' && id) {
        emit('explorer-copy-video-id', id);
      }
      hideCtxMenu();
    });

    document.addEventListener('contextmenu', function(e) {
      if (!isWatchPageUrl(window.location.href)) return;
      if (!isVideoAreaTarget(e.target)) return;
      const watchUrl = canonicalYouTubeWatchUrl(window.location.href);
      if (!watchUrl) return;
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, watchUrl);
    }, true);

    document.addEventListener('click', function(e) {
      if (!ctxMenu.classList.contains('open')) return;
      if (e.target && ctxMenu.contains(e.target)) return;
      hideCtxMenu();
    }, true);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') hideCtxMenu();
    });

    window.addEventListener('scroll', hideCtxMenu, true);
    window.addEventListener('yt-navigate-finish', hideCtxMenu);

    let lastUrl = window.location.href;
    function checkUrl(force) {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl || force) {
        lastUrl = currentUrl;
        hideCtxMenu();
        if (isWatchPageUrl(currentUrl)) {
          btn.classList.add('visible');
        } else {
          btn.classList.remove('visible');
        }
      }
    }
    setInterval(function() { checkUrl(false); }, 1000);
    window.addEventListener('yt-navigate-finish', function() { checkUrl(true); });
    checkUrl(true);
  })();`;
}
