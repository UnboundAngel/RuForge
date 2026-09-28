(function () {
  try {
    var host = (window.location.hostname || "").toLowerCase();
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return;
    if (window.__rfRadialNavBridge) return;
    window.__rfRadialNavBridge = true;

    var emitAlt = function (down) {
      try {
        var internals = window.__TAURI_INTERNALS__;
        if (!internals || typeof internals.invoke !== "function") return;
        var pending = internals.invoke("plugin:event|emit", {
          event: "radial-nav:alt",
          payload: { down: down },
        });
        if (pending && typeof pending.catch === "function") pending.catch(function () {});
      } catch (e) {}
    };

    var isTyping = function () {
      var el = document.activeElement;
      if (!el) return false;
      var tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    window.addEventListener(
      "keydown",
      function (e) {
        if (e.key !== "Alt" || e.repeat || isTyping()) return;
        e.preventDefault();
        emitAlt(true);
      },
      true
    );
    window.addEventListener(
      "keyup",
      function (e) {
        if (e.key === "Alt") emitAlt(false);
      },
      true
    );
  } catch (e) {}
})();
