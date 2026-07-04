(function () {
  var el = {
    library: document.getElementById('library'),
    videoShell: document.getElementById('video-shell'),
    video: document.getElementById('player'),
    playbackError: document.getElementById('playback-error'),
    debugStrip: document.getElementById('debug-strip'),
    sessionLabel: document.getElementById('session-label'),
    debugGrid: document.getElementById('debug-grid'),
    search: document.getElementById('search'),
    filters: document.getElementById('filters'),
    copyDebug: document.getElementById('copy-debug'),
    empty: document.getElementById('empty'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingTitle: document.getElementById('loading-title'),
    loadingSub: document.getElementById('loading-sub'),
    debugToggle: document.getElementById('debug-toggle'),
    gateCard: document.getElementById('gate-card'),
    gateTitle: document.getElementById('gate-title'),
    gateBody: document.getElementById('gate-body'),
    gateActions: document.getElementById('gate-actions'),
    gateRetry: document.getElementById('gate-retry'),
    gateNote: document.getElementById('gate-note'),
    mainTools: document.getElementById('main-tools'),
    sessionHint: document.getElementById('session-hint'),
    pairedReassurance: document.getElementById('paired-reassurance'),
  };

  var FETCH_OPTS = { credentials: 'same-origin' };
  var PAIRED_PATH = '/paired';
  var PROGRESS_DEBOUNCE_MS = 8000;
  var RECONNECT_BASE_MS = 5000;
  var RECONNECT_MAX_MS = 30000;
  var CATALOG_REFRESH_MAX_POLLS = 60;
  var BLOCK_DISCONNECTED = { 'session-lost': 1, unpaired: 1, expired: 1 };

  var PLAYBACK_ERROR_COPY = {
    unknown_id: 'This item is no longer in your library.',
    not_playable: 'This file cannot be played in the browser.',
    file_missing: 'The file is missing on disk.',
    signed_url_expired: 'The stream link expired. Select the item again.',
    bad_signature: 'The stream link was invalid. Select the item again.',
    companion_not_ready: 'RuForge is still starting. Try playback again in a moment.',
  };

  var SESSION_STREAM_ERRORS = { session_revoked: 1, no_session: 1 };

  var progressFlushTimer = null;
  var reconnectTimer = null;
  var reconnectDelayMs = RECONNECT_BASE_MS;
  var reconnectInFlight = false;
  var debugExpanded = window.matchMedia('(min-width: 541px)').matches;

  var state = {
    session: 'loading',
    items: [],
    activeId: null,
    filter: 'all',
    search: '',
    lastRequest: 'boot',
    lastError: '',
    catalogRefreshPolls: 0,
  };

  var GATE_UI = {
    disconnected: {
      title: 'RuForge is closed or disconnected',
      body: 'RuForge is not reachable on this PC. Start RuForge, enable Browser companion in Settings, then try again. This page will retry quietly in the background.',
      retry: 'Try again',
    },
    'session-lost': {
      title: 'Session ended',
      body: 'RuForge restarted or revoked this browser session. Use Open in web from RuForge Settings on this PC to pair again.',
      retry: 'Check connection',
    },
    expired: {
      title: 'Link expired',
      body: 'This pairing link was already used or timed out. Use Open in web from RuForge Settings. Sessions also clear when RuForge restarts.',
      retry: 'Try again',
      normalizePublic: true,
    },
    default: {
      title: 'Not paired',
      body: 'Open in web from RuForge Settings on this PC, or use a fresh pairing link. Your session stays active until RuForge restarts.',
      retry: 'Try again',
    },
  };

  function itemMediaType(item) {
    if (item.mediaType === 'audio' || item.mediaType === 'video') return item.mediaType;
    var c = (item.container || '').toLowerCase();
    var audio = { mp3: 1, m4a: 1, flac: 1, opus: 1, ogg: 1, wav: 1 };
    if (audio[c]) return 'audio';
    if (!item.videoCodec && item.audioCodec) return 'audio';
    return 'video';
  }

  function computeCounts(items) {
    var counts = { total: items.length, audio: 0, video: 0, playable: 0, unsupported: 0 };
    items.forEach(function (item) {
      if (itemMediaType(item) === 'audio') counts.audio++;
      else counts.video++;
      if (item.playable) counts.playable++;
      else counts.unsupported++;
    });
    return counts;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmtDuration(secs) {
    secs = secs || 0;
    var m = Math.floor(secs / 60);
    var s = Math.floor(secs % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtSize(bytes) {
    if (!bytes) return '';
    var mb = bytes / (1024 * 1024);
    if (mb < 1024) return mb.toFixed(0) + ' MB';
    return (mb / 1024).toFixed(1) + ' GB';
  }

  function isFetchNetworkError(err) {
    if (!err) return false;
    if (err.name === 'TypeError') return true;
    var msg = String(err.message || err);
    return msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1;
  }

  function readApiErrorCode(res) {
    return res
      .json()
      .then(function (body) {
        return (body && body.error) || '';
      })
      .catch(function () {
        return '';
      });
  }

  function playbackMessageForCode(code, status) {
    if (code && PLAYBACK_ERROR_COPY[code]) return PLAYBACK_ERROR_COPY[code];
    if (status === 404) return 'Stream not found.';
    if (status === 403) return 'Stream access denied.';
    if (status === 410) return PLAYBACK_ERROR_COPY.signed_url_expired;
    if (status === 503) return PLAYBACK_ERROR_COPY.companion_not_ready;
    return 'Playback failed (' + (code || status) + ').';
  }

  function clearPlaybackError() {
    el.playbackError.textContent = '';
    el.playbackError.classList.add('hidden');
    el.videoShell.classList.remove('is-error');
  }

  function showPlaybackError(message) {
    if (!message) return;
    el.videoShell.style.display = 'block';
    el.playbackError.textContent = message;
    el.playbackError.classList.remove('hidden');
    el.videoShell.classList.add('is-error');
    setError(message);
  }

  function rejectPlaybackResponse(res) {
    return readApiErrorCode(res).then(function (code) {
      if (SESSION_STREAM_ERRORS[code]) {
        enterSessionLost('stream auth failed');
        return null;
      }
      throw new Error(playbackMessageForCode(code, res.status));
    });
  }

  function startVideoPlayback(id) {
    return companionFetch('progress-get', '/progress/' + encodeURIComponent(id), FETCH_OPTS)
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (progress) {
        var seek =
          progress && Number.isFinite(progress.positionSecs) && progress.positionSecs > 0.25
            ? progress.positionSecs
            : null;

        function beginPlay() {
          if (seek !== null) {
            try {
              el.video.currentTime = seek;
            } catch (_) {}
          }
          return el.video.play();
        }

        if (el.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          return beginPlay();
        }

        return new Promise(function (resolve, reject) {
          el.video.addEventListener(
            'loadedmetadata',
            function () {
              beginPlay().then(resolve).catch(reject);
            },
            { once: true }
          );
          el.video.addEventListener(
            'error',
            function () {
              reject(new Error('media load failed'));
            },
            { once: true }
          );
        });
      })
      .then(function () {
        clearPlaybackError();
      })
      .catch(function (err) {
        if (err && err.name === 'NotAllowedError') {
          showPlaybackError('Tap play to start (browser blocked autoplay).');
          return;
        }
        if (isFetchNetworkError(err)) {
          showPlaybackError('Network error while starting playback.');
          return;
        }
        showPlaybackError('Playback could not start.');
      });
  }

  function attachStreamSource(url, id) {
    el.videoShell.style.display = 'block';
    el.video.src = url;
    companionFetch('stream', url, {
      credentials: 'same-origin',
      headers: { Range: 'bytes=0-1' },
    }).catch(function () {});
    return startVideoPlayback(id);
  }

  function setLoading(show, title, sub) {
    if (title) el.loadingTitle.textContent = title;
    if (typeof sub === 'string') el.loadingSub.textContent = sub;
    el.loadingOverlay.classList.toggle('hidden', !show);
  }

  function setDebugExpanded(expanded) {
    debugExpanded = expanded;
    el.debugGrid.classList.toggle('collapsed', !expanded);
    el.debugToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    el.debugToggle.textContent = expanded ? 'hide stats' : 'stats';
  }

  function normalizePublicUrl() {
    try {
      if (window.location.pathname === '/' && !window.location.search && !window.location.hash) return;
      window.history.replaceState(null, '', '/');
    } catch (_) {}
  }

  function normalizePairedUrl() {
    try {
      if (window.location.pathname === PAIRED_PATH && !window.location.search && !window.location.hash) return;
      window.history.replaceState(null, '', PAIRED_PATH);
    } catch (_) {}
  }

  function clearReconnectTimer() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function resetReconnectBackoff() {
    reconnectDelayMs = RECONNECT_BASE_MS;
    el.gateNote.classList.add('hidden');
    el.gateNote.textContent = '';
  }

  function scheduleReconnect() {
    if (state.session !== 'disconnected') return;
    clearReconnectTimer();
    el.gateNote.textContent = 'Checking again in ' + Math.round(reconnectDelayMs / 1000) + 's…';
    el.gateNote.classList.remove('hidden');
    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = null;
      tryReconnect(false);
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
  }

  function setSession(next) {
    state.session = next;
    el.debugStrip.className = 'debug-strip session-' + next;
    el.sessionLabel.textContent = next;
    var isPaired = next === 'paired';
    el.sessionHint.style.display = isPaired ? 'none' : '';
    el.pairedReassurance.classList.toggle('hidden', !isPaired);
    updateDebugUI();
  }

  function setLastRequest(label, status) {
    state.lastRequest = label + ' ' + status;
    updateDebugUI();
  }

  function setError(msg) {
    state.lastError = msg || '';
    updateDebugUI();
  }

  function showGate(kind) {
    var ui = GATE_UI[kind] || GATE_UI.default;
    el.mainTools.classList.add('hidden');
    el.gateCard.classList.remove('hidden');
    el.gateActions.classList.remove('hidden');
    el.gateRetry.disabled = false;
    el.gateNote.classList.add('hidden');
    if (ui.normalizePublic) normalizePublicUrl();
    el.gateTitle.textContent = ui.title;
    el.gateBody.textContent = ui.body;
    el.gateRetry.textContent = ui.retry;
  }

  function hideGate() {
    el.gateCard.classList.add('hidden');
    el.gateActions.classList.add('hidden');
    el.mainTools.classList.remove('hidden');
    clearReconnectTimer();
    resetReconnectBackoff();
  }

  function enterSessionLost(reason) {
    clearReconnectTimer();
    resetReconnectBackoff();
    setSession('session-lost');
    setError(reason || 'session lost');
    setLoading(false);
    showGate('session-lost');
  }

  function enterDisconnected(reason) {
    if (BLOCK_DISCONNECTED[state.session]) return;
    clearReconnectTimer();
    setSession('disconnected');
    setError(reason || 'server unreachable');
    setLoading(false);
    showGate('disconnected');
    scheduleReconnect();
  }

  function enterApplicationError(reason) {
    setError(reason || 'request failed');
    setSession('error');
    setLoading(false);
    showGate('disconnected');
  }

  function handleFetchFailure(err, fallbackMsg, opts) {
    opts = opts || {};
    if (opts.skipIfExpired && state.session === 'expired') return;
    if (isFetchNetworkError(err)) {
      enterDisconnected(err.message || fallbackMsg);
      return;
    }
    enterApplicationError(err.message || fallbackMsg);
  }

  function companionFetch(label, url, init) {
    var options = init || {};
    if (!options.credentials) options.credentials = 'same-origin';
    return fetch(url, options).then(function (res) {
      setLastRequest(label, res.status);
      return res;
    });
  }

  function fetchHealthz() {
    return companionFetch('healthz', '/healthz', FETCH_OPTS).then(function (res) {
      if (!res.ok) throw new Error('healthz ' + res.status);
      return res.json();
    });
  }

  function fetchLibraryRaw() {
    return companionFetch('library', '/library', FETCH_OPTS).then(function (res) {
      if (res.status === 401) return res;
      if (!res.ok) throw new Error('library ' + res.status);
      return res;
    });
  }

  function loadLibraryJson(res) {
    if (res.status === 401) {
      enterSessionLost('session lost');
      return null;
    }
    return res.json();
  }

  function fetchLibraryPipeline() {
    return fetchLibraryRaw().then(loadLibraryJson);
  }

  function handleLibraryData(data) {
    if (data.ready === false) {
      setSession('loading');
      setLoading(true, 'Loading your RuForge library', 'Building library index');
      window.setTimeout(function () {
        fetchLibraryPipeline()
          .then(function (retryData) {
            if (retryData) handleLibraryData(retryData);
          })
          .catch(function (err) {
            handleFetchFailure(err, 'library failed');
          });
      }, 2000);
      return;
    }
    state.items = data.items || [];
    setSession('paired');
    setError('');
    hideGate();
    normalizePairedUrl();
    renderLibrary();
    if (data.refreshing === true && state.catalogRefreshPolls < CATALOG_REFRESH_MAX_POLLS) {
      state.catalogRefreshPolls += 1;
      window.setTimeout(function () {
        fetchLibraryPipeline()
          .then(function (retryData) {
            if (retryData) handleLibraryData(retryData);
          })
          .catch(function (err) {
            handleFetchFailure(err, 'library refresh failed');
          });
      }, 2000);
    } else if (data.refreshing !== true) {
      state.catalogRefreshPolls = 0;
    }
  }

  function pairWithCode(code) {
    setSession('loading');
    setLoading(true, 'Pairing with RuForge', 'Checking your link on this PC');
    return companionFetch('pair', '/pair', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code }),
    })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          setSession('expired');
          setError('pairing code expired or already used');
          setLoading(false);
          showGate('expired');
          return null;
        }
        if (!res.ok) throw new Error('pair ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        return fetchLibraryPipeline().then(function (libData) {
          if (libData) handleLibraryData(libData);
        });
      })
      .catch(function (err) {
        handleFetchFailure(err, 'pair failed', { skipIfExpired: true });
      });
  }

  function tryReconnect(manual) {
    if (reconnectInFlight) return;
    if (state.session === 'unpaired' || state.session === 'expired') {
      if (manual) boot(true);
      return;
    }
    reconnectInFlight = true;
    if (manual) {
      el.gateRetry.disabled = true;
      setLoading(true, 'Reconnecting to RuForge', 'Checking localhost server');
    }
    fetchHealthz()
      .then(fetchLibraryRaw)
      .then(loadLibraryJson)
      .then(function (data) {
        if (!data) return;
        resetReconnectBackoff();
        handleLibraryData(data);
      })
      .catch(function (err) {
        handleFetchFailure(err, 'reconnect failed');
      })
      .finally(function () {
        reconnectInFlight = false;
        el.gateRetry.disabled = false;
        if (manual) setLoading(false);
      });
  }

  function boot(manual) {
    clearReconnectTimer();
    resetReconnectBackoff();
    setSession('loading');
    setLoading(true, 'Connecting to RuForge', 'Checking your session on this PC');
    fetchLibraryRaw()
      .then(function (res) {
        if (res.ok) {
          return res.json().then(handleLibraryData);
        }
        if (res.status === 401) {
          var code = new URLSearchParams(window.location.search).get('c');
          if (code) return pairWithCode(code);
          setSession('unpaired');
          setError('no active session');
          setLoading(false);
          showGate('unpaired');
          return;
        }
        throw new Error('library ' + res.status);
      })
      .catch(function (err) {
        handleFetchFailure(err, 'connection failed');
      });
  }

  function activeItem() {
    if (!state.activeId) return null;
    for (var i = 0; i < state.items.length; i++) {
      if (state.items[i].id === state.activeId) return state.items[i];
    }
    return null;
  }

  function updateDebugUI() {
    var counts = computeCounts(state.items);
    el.debugGrid.innerHTML =
      cell('items', String(counts.total)) +
      cell('audio', String(counts.audio)) +
      cell('video', String(counts.video)) +
      cell('playable', String(counts.playable)) +
      cell('unsupported', String(counts.unsupported)) +
      cell('host', location.host || 'unknown', true) +
      cell('last req', state.lastRequest, true) +
      cell('filter', state.filter, true);
  }

  function cell(label, value, mono) {
    return (
      '<div class="debug-cell"><span class="label">' +
      label +
      '</span><span class="value' +
      (mono ? ' mono' : '') +
      '">' +
      esc(value) +
      '</span></div>'
    );
  }

  function devParts(item, selected) {
    var parts = [itemMediaType(item), item.playable ? 'playable' : 'unsupported'];
    if (item.container) parts.push(item.container.toLowerCase());
    if (item.hasThumb) parts.push('thumb');
    if (selected) parts.push('selected');
    return parts.join(' · ');
  }

  function matchesFilter(item) {
    var type = itemMediaType(item);
    if (state.filter === 'audio' && type !== 'audio') return false;
    if (state.filter === 'video' && type !== 'video') return false;
    if (state.filter === 'playable' && !item.playable) return false;
    if (state.filter === 'unsupported' && item.playable) return false;
    if (state.search && item.title.toLowerCase().indexOf(state.search.toLowerCase()) === -1) return false;
    return true;
  }

  function setActiveRow(id) {
    state.activeId = id;
    var rows = el.library.querySelectorAll('.item');
    for (var i = 0; i < rows.length; i++) {
      var isActive = rows[i].dataset.id === id;
      rows[i].classList.toggle('active', isActive);
      var dev = rows[i].querySelector('.dev');
      if (dev && dev.dataset.base) dev.textContent = dev.dataset.base + (isActive ? ' · selected' : '');
    }
    updateDebugUI();
  }

  function renderLibrary() {
    var visible = 0;
    el.library.innerHTML = '';
    state.items.forEach(function (item) {
      if (!matchesFilter(item)) return;
      visible++;
      var type = itemMediaType(item);
      var selected = item.id === state.activeId;
      var li = document.createElement('li');
      li.dataset.id = item.id;
      li.className = 'item ' + type + (item.playable ? '' : ' unsupported');
      if (selected) li.classList.add('active');

      var left = document.createElement('div');
      left.className = 'item-left';
      var title = document.createElement('span');
      title.className = 'title';
      title.textContent = item.title;
      var dev = document.createElement('span');
      dev.className = 'dev';
      var base = devParts(item, false);
      dev.dataset.base = base;
      dev.textContent = selected ? base + ' · selected' : base;
      left.appendChild(title);
      left.appendChild(dev);

      var meta = document.createElement('span');
      meta.className = 'meta';
      var metaParts = [fmtDuration(item.durationSecs)];
      if (item.sizeBytes) metaParts.push(fmtSize(item.sizeBytes));
      meta.textContent = metaParts.join(' · ');

      li.appendChild(left);
      li.appendChild(meta);

      if (item.playable) {
        li.addEventListener('click', function () {
          setActiveRow(item.id);
          playItem(item.id);
        });
      }
      el.library.appendChild(li);
    });
    el.empty.classList.toggle('hidden', visible > 0);
    updateDebugUI();
    setLoading(false);
  }

  function playItem(id) {
    clearPlaybackError();
    companionFetch('stream-token', '/stream-token/' + encodeURIComponent(id), {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(function (res) {
        if (res.status === 401) {
          enterSessionLost('stream auth failed');
          return null;
        }
        if (!res.ok) return rejectPlaybackResponse(res);
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (!data.url) {
          showPlaybackError('Playback URL missing from server.');
          return;
        }
        return attachStreamSource(data.url, id);
      })
      .catch(function (err) {
        if (isFetchNetworkError(err)) {
          enterDisconnected(err.message || 'playback failed');
          return;
        }
        showPlaybackError(err.message || 'Playback failed.');
      });
  }

  function flushProgress() {
    if (progressFlushTimer) {
      clearTimeout(progressFlushTimer);
      progressFlushTimer = null;
    }
    if (!state.activeId || state.session !== 'paired') return;
    var pos = el.video.currentTime;
    var dur = el.video.duration;
    if (!Number.isFinite(pos) || pos < 0) return;
    if (!Number.isFinite(dur) || dur < 0) dur = 0;
    var playbackState = 'playing';
    if (el.video.ended) playbackState = 'ended';
    else if (el.video.paused) playbackState = 'paused';
    companionFetch('progress', '/progress/' + encodeURIComponent(state.activeId), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionSecs: pos,
        durationSecs: dur,
        playbackState: playbackState,
      }),
    })
      .then(function (res) {
        if (res.status === 401) enterSessionLost('progress auth failed');
      })
      .catch(function (err) {
        if (isFetchNetworkError(err)) enterDisconnected(err.message || 'progress failed');
      });
  }

  function scheduleProgressFlush() {
    if (!state.activeId || state.session !== 'paired') return;
    if (progressFlushTimer) return;
    progressFlushTimer = window.setTimeout(function () {
      progressFlushTimer = null;
      flushProgress();
    }, PROGRESS_DEBOUNCE_MS);
  }

  function wireProgressSync() {
    el.video.addEventListener('timeupdate', scheduleProgressFlush);
    el.video.addEventListener('pause', flushProgress);
    el.video.addEventListener('ended', flushProgress);
    el.video.addEventListener('playing', clearPlaybackError);
    el.video.addEventListener('error', function () {
      var code = el.video.error && el.video.error.code;
      if (code === MediaError.MEDIA_ERR_ABORTED) return;
      if (code === MediaError.MEDIA_ERR_NETWORK) {
        showPlaybackError('Network error while loading media.');
        return;
      }
      if (code === MediaError.MEDIA_ERR_DECODE) {
        showPlaybackError('This file could not be decoded in the browser.');
        return;
      }
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        showPlaybackError('This format is not supported for browser playback.');
        return;
      }
      showPlaybackError('Playback failed in the browser.');
    });
    window.addEventListener('pagehide', flushProgress);
  }

  function debugSummary() {
    var counts = computeCounts(state.items);
    var sel = activeItem();
    var lines = [
      'host: ' + (location.host || 'unknown'),
      'user-agent: ' + navigator.userAgent,
      'session: ' + state.session,
      'counts: total=' +
        counts.total +
        ' audio=' +
        counts.audio +
        ' video=' +
        counts.video +
        ' playable=' +
        counts.playable +
        ' unsupported=' +
        counts.unsupported,
      'filter: ' + state.filter,
      'search: ' + (state.search || '(empty)'),
      'last-request: ' + state.lastRequest,
    ];
    if (sel) {
      lines.push(
        'selected: ' +
          sel.title +
          ' | id=' +
          sel.id +
          ' | mediaType=' +
          itemMediaType(sel) +
          ' | playable=' +
          sel.playable
      );
    } else {
      lines.push('selected: (none)');
    }
    lines.push('last-error: ' + (state.lastError || '(none)'));
    return lines.join('\n');
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (_) {}
    document.body.removeChild(ta);
  }

  el.gateRetry.addEventListener('click', function () {
    clearReconnectTimer();
    resetReconnectBackoff();
    if (state.session === 'session-lost' || state.session === 'disconnected') {
      tryReconnect(true);
      return;
    }
    boot(true);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (state.session === 'disconnected') {
      resetReconnectBackoff();
      tryReconnect(false);
    } else if (state.session === 'session-lost') {
      tryReconnect(false);
    }
  });

  el.debugToggle.addEventListener('click', function () {
    setDebugExpanded(!debugExpanded);
  });

  el.filters.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-filter]');
    if (!btn) return;
    state.filter = btn.dataset.filter;
    el.filters.querySelectorAll('.filter-btn').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    renderLibrary();
  });

  el.search.addEventListener('input', function () {
    state.search = el.search.value.trim();
    renderLibrary();
  });

  el.copyDebug.addEventListener('click', function () {
    var text = debugSummary();
    function done() {
      el.copyDebug.textContent = 'copied';
      el.copyDebug.classList.add('ok');
      window.setTimeout(function () {
        el.copyDebug.textContent = 'copy debug summary';
        el.copyDebug.classList.remove('ok');
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  });

  wireProgressSync();
  setDebugExpanded(debugExpanded);
  updateDebugUI();
  boot(false);
})();
