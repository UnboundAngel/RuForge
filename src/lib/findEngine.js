// Find on page for RuForge and the glance viewer. Plain JS on purpose: the app imports it and Rust
// injects the same file into glance pages (include_str in glance.rs), so both find the same way.
// Matches paint through the CSS Custom Highlight API (`::highlight(rf-find)` / `rf-find-active`),
// which never touches the page's DOM.
(function () {
  if (typeof window === "undefined") return;
  if (window.__rfFind) return;
  var MAX = 1000;
  var EDGE = 64;
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1 };
  var canPaint = typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";
  var term = "";
  var ranges = [];
  var idx = -1;
  var dirty = true;
  var observer = null;

  function shown(el) {
    if (!el || el.closest("[data-rf-find-ignore]")) return false;
    return el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : true;
  }

  function collect() {
    ranges = [];
    var needle = term.toLowerCase();
    if (!needle || !document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return p && !SKIP[p.tagName] ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var node;
    while ((node = walker.nextNode()) && ranges.length < MAX) {
      var text = node.data.toLowerCase();
      var at = text.indexOf(needle);
      if (at === -1 || !shown(node.parentElement)) continue;
      while (at !== -1 && ranges.length < MAX) {
        var r = document.createRange();
        r.setStart(node, at);
        r.setEnd(node, at + needle.length);
        ranges.push(r);
        at = text.indexOf(needle, at + needle.length);
      }
    }
  }

  function watch() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      dirty = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function paint() {
    if (!canPaint) return;
    var rest = ranges.filter(function (_, i) {
      return i !== idx;
    });
    CSS.highlights.set("rf-find", new Highlight(...rest));
    if (idx >= 0 && ranges[idx]) CSS.highlights.set("rf-find-active", new Highlight(ranges[idx]));
    else CSS.highlights.delete("rf-find-active");
  }

  /** Smooth scroll, and only when the match is off screen, so stepping through visible ones stays still. */
  function reveal() {
    var r = ranges[idx];
    if (!r) return;
    var box = r.getBoundingClientRect();
    if (box.top >= EDGE && box.bottom <= window.innerHeight - EDGE && box.left >= 0 && box.right <= window.innerWidth) return;
    var el = r.startContainer.parentElement;
    if (el) el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }

  /** First match at or below the top of the view, so a new search does not jump back to the top. */
  function firstInView() {
    for (var i = 0; i < ranges.length; i++) {
      var box = ranges[i].getBoundingClientRect();
      if (box.width > 0 && box.bottom >= 0) return i;
    }
    return 0;
  }

  function clear() {
    term = "";
    ranges = [];
    idx = -1;
    dirty = true;
    if (observer) observer.disconnect();
    observer = null;
    if (canPaint) {
      CSS.highlights.delete("rf-find");
      CSS.highlights.delete("rf-find-active");
    }
  }

  /** `step` is 1 for next, -1 for previous, 0 to (re)run the search. Returns a 1-based index. */
  function run(next, step) {
    next = String(next || "").slice(0, 500);
    if (!next) {
      clear();
      return { index: 0, count: 0 };
    }
    if (next !== term) {
      term = next;
      dirty = true;
      idx = -1;
    }
    if (dirty) {
      collect();
      dirty = false;
      watch();
      if (idx >= ranges.length) idx = ranges.length - 1;
    }
    if (!ranges.length) {
      idx = -1;
      paint();
      return { index: 0, count: 0 };
    }
    if (idx < 0) idx = firstInView();
    else if (step) idx = (idx + step + ranges.length) % ranges.length;
    paint();
    reveal();
    return { index: idx + 1, count: ranges.length };
  }

  // Frozen so a glance page cannot swap `run` for its own and feed glance_find made-up results.
  Object.defineProperty(window, "__rfFind", { value: Object.freeze({ run: run, clear: clear }), configurable: false });
})();
