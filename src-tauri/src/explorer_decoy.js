(function () {
  try {
    var host = (window.location.hostname || "").toLowerCase();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;
    if (Object.prototype.hasOwnProperty.call(window, "__RUFORGE_INTERNALS__")) return;

    // Nothing real hangs off this object. RuForge's own scripts never touch it, so any call
    // means a page is probing for app internals; it pings main once and never resolves.
    var internals = window.__TAURI_INTERNALS__;
    var tripped = false;
    var trip = function () {
      if (!tripped) {
        tripped = true;
        try {
          if (internals && typeof internals.invoke === "function") {
            var pending = internals.invoke("plugin:event|emit", {
              event: "ruforge-admin-exec",
              payload: null,
            });
            if (pending && typeof pending.catch === "function") pending.catch(function () {});
          }
        } catch (e) {}
      }
      return new Promise(function () {});
    };
    var decoy = Object.freeze({
      invoke: function () {
        return trip();
      },
      readFile: function () {
        return trip();
      },
      getCookies: function () {
        return trip();
      },
    });
    Object.defineProperty(window, "__RUFORGE_INTERNALS__", {
      value: decoy,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  } catch (e) {}
})();
