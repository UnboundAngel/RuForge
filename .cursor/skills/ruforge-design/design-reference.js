const FILTERS = {
  all: { accent: "#ffffff", bg: "#ffffff", muted: "#2a2a2a" },
  relax: { accent: "#6ec4dc", bg: "#357d92", muted: "#1e3d45" },
  focus: { accent: "#d4b65a", bg: "#9a8044", muted: "#3d3520" },
};
const stage = document.getElementById("filter-stage");
const pills = stage.querySelectorAll(".filter-pill");
function paint() {
  pills.forEach((p) => {
    const f = FILTERS[p.dataset.f];
    const on = p.classList.contains("on");
    p.style.background = on ? f.bg : f.muted;
    p.style.color = on ? (p.dataset.f === "all" ? "#0a0a0a" : "#ffffff") : (p.dataset.f === "all" ? "#b3b3b3" : f.accent);
  });
}
pills.forEach((p) => p.addEventListener("click", () => {
  pills.forEach((o) => o.classList.toggle("on", o === p));
  paint();
}));
document.getElementById("compact-toggle").addEventListener("click", () => stage.classList.toggle("compact"));
paint();

const ICONS = {
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>',
};
document.querySelectorAll(".orb").forEach((orb) => {
  const d = orb.dataset;
  if (d.p) orb.style.setProperty("--p", d.p);
  const burst = "burst" in d
    ? '<span class="orb-burst">' + Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const dist = 14 + (i % 3) * 5;
        return `<i style="--x:${(Math.cos(a) * dist).toFixed(1)}px;--y:${(Math.sin(a) * dist).toFixed(1)}px;animation-delay:${(i % 4) * 18}ms"></i>`;
      }).join("") + "</span>"
    : "";
  orb.innerHTML =
    '<span class="orb-body">' +
      `<span class="orb-thumb${"empty" in d ? " orb-thumb--empty" : ""}">${"empty" in d ? ICONS.download : ""}</span>` +
      '<svg class="orb-ring" width="44" height="44" aria-hidden><circle class="trk" cx="22" cy="22" r="19.75" fill="none" stroke-width="2.5"/><circle class="bar" cx="22" cy="22" r="19.75" fill="none" stroke-width="2.5" stroke-linecap="round" pathLength="100"/></svg>' +
      (d.count ? `<span class="orb-count">${d.count}</span>` : "") +
      `<span class="orb-scrim">${d.icon ? ICONS[d.icon] : orb.classList.contains("s-live") ? ICONS.check : ""}</span>` +
    "</span>" + burst;
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function runLive(live, liveLabel) {
  const say = (t) => { if (liveLabel) liveLabel.textContent = t; };
  for (;;) {
    live.className = "orb s-live is-spin";
    live.style.setProperty("--p", "0");
    say("Fetching");
    await wait(1800);
    live.classList.remove("is-spin");
    say("Downloading");
    let p = 0;
    while (p < 99) {
      p = Math.min(99, p + 4 + Math.random() * 9);
      live.style.setProperty("--p", p.toFixed(1));
      await wait(260);
    }
    await wait(400);
    live.classList.add("is-done");
    live.style.setProperty("--p", "100");
    say("Done");
    await wait(2100);
    live.classList.add("is-exit");
    await wait(320);
    say("");
    await wait(700);
  }
}
runLive(document.getElementById("orb-live"), document.getElementById("orb-live-label"));
document.querySelectorAll(".orb[data-live]").forEach((o) => runLive(o, null));

const ROLL_WORDS = ["Queued", "Fetching", "Downloading", "Saved"];
let rollIx = 0;
const roll = document.getElementById("roll");
document.getElementById("roll-btn").addEventListener("click", () => {
  rollIx = (rollIx + 1) % ROLL_WORDS.length;
  roll.innerHTML = [...ROLL_WORDS[rollIx]].map((ch, i) => `<i style="animation-delay:${i * 30}ms">${ch}</i>`).join("");
});

const edgeWrap = document.getElementById("edge-wrap");
const edgeScroll = document.getElementById("edge-scroll");
edgeScroll.addEventListener("scroll", () => {
  const { scrollTop, scrollHeight, clientHeight } = edgeScroll;
  edgeWrap.dataset.scrollTop = String(scrollTop > 4);
  edgeWrap.dataset.scrollBottom = String(scrollTop + clientHeight < scrollHeight - 4);
});

const PP = {
  pause: ["M25 20 L42 20 L42 80 L25 80 Z", "M58 20 L75 20 L75 80 L58 80 Z"],
  play: ["M30 20 L76 46 L78 50 L30 50 Z", "M30 50 L78 50 L76 54 L30 80 Z"],
};
let ppPlaying = false;
document.getElementById("pp-btn").addEventListener("click", () => {
  ppPlaying = !ppPlaying;
  const s = PP[ppPlaying ? "pause" : "play"];
  document.getElementById("pp-a").style.d = `path("${s[0]}")`;
  document.getElementById("pp-b").style.d = `path("${s[1]}")`;
});

document.querySelectorAll("[data-toggle]").forEach((t) => t.addEventListener("click", () => t.classList.toggle("on")));

const fmt = document.getElementById("fmt");
fmt.querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => {
  fmt.classList.toggle("audio", i === 1);
  fmt.querySelectorAll("button").forEach((o, j) => o.classList.toggle("on", j === i));
}));

const $ = (id) => document.getElementById(id);
const svg = (d, size = 20, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const PLAY = '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>';
const PAUSE = '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>';

const sbScroll = $("sb-scroll");
const sbThumb = $("sb-thumb");
function paintThumb() {
  const { scrollTop, scrollHeight, clientHeight } = sbScroll;
  const h = Math.max(20, (clientHeight / scrollHeight) * (clientHeight - 12));
  sbThumb.style.height = h + "px";
  sbThumb.style.top = 6 + (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - 12 - h) + "px";
}
sbScroll.addEventListener("scroll", paintThumb);
paintThumb();

function bindStuck(boxId, headId, attr) {
  const box = $(boxId);
  const head = $(headId);
  box.addEventListener("scroll", () => { head.dataset[attr] = String(box.scrollTop > 2); });
}
bindStuck("stuck-box", "stuck-head", "stuck");
bindStuck("ds-box", "ds-head", "shadow");

const sqClip = $("sq-clip");
const sqRow = $("sq-row");
function squish() {
  const r = sqRow.getBoundingClientRect();
  const { scrollLeft, scrollWidth, clientWidth } = sqRow;
  sqClip.dataset.fadeLeft = String(scrollLeft > 2);
  sqClip.dataset.fadeRight = String(scrollLeft + clientWidth < scrollWidth - 2);
  sqRow.querySelectorAll(".sq-cover").forEach((c) => {
    const b = c.parentElement.getBoundingClientRect();
    const visible = Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left));
    const ratio = visible / b.width;
    if (ratio >= 0.995) { c.style.transform = ""; return; }
    c.style.transformOrigin = b.left < r.left ? "right center" : b.right > r.right ? "left center" : "center";
    c.style.transform = `scale(${(0.88 + ratio * 0.12).toFixed(3)})`;
  });
}
sqRow.addEventListener("scroll", squish);
squish();

const gcScroll = $("gc-scroll");
gcScroll.addEventListener("scroll", () => {
  const a = Math.min(1, Math.max(0, gcScroll.scrollTop / 64));
  $("gc-title").style.opacity = String(1 - a);
  $("gc-title").style.transform = `translateY(${-a * 12}px)`;
  $("gc-plate").style.opacity = String(a);
});

let pstDetail = false;
$("pst-btn").addEventListener("click", () => {
  pstDetail = !pstDetail;
  $("pst-a").className = "pst-screen" + (pstDetail ? " off-l" : "");
  $("pst-b").className = "pst-screen" + (pstDetail ? "" : " off-r");
  $("pst-btn").textContent = pstDetail ? "Back" : "Open detail";
});

const ISL = [["cv1", "Legends", "Juice WRLD"], ["cv3", "Wishing Well", "Juice WRLD"], ["cv5", "Bandit", "Juice WRLD, NBA YoungBoy"]];
let islIx = 0;
const isl = $("isl");
function islItem(ix) {
  const [c, t, a] = ISL[ix];
  const el = document.createElement("div");
  el.className = "isl-item";
  el.innerHTML = `<span class="sq-cover ${c}"></span><span><b>${t}</b><small>${a}</small></span>`;
  return el;
}
isl.appendChild(islItem(0));
function islSkip(dir) {
  const old = isl.lastElementChild;
  islIx = (islIx + dir + ISL.length) % ISL.length;
  const next = islItem(islIx);
  next.style.transition = "none";
  next.style.opacity = "0";
  next.style.transform = `translateX(${dir > 0 ? 28 : -24}px) scale(${dir > 0 ? 0.92 : 0.94})`;
  isl.appendChild(next);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    next.style.transition = "";
    next.style.opacity = "1";
    next.style.transform = "none";
    old.style.opacity = "0";
    old.style.transform = `translateX(${dir > 0 ? -24 : 28}px) scale(${dir > 0 ? 0.94 : 0.92})`;
  }));
  setTimeout(() => old.remove(), 420);
}
$("isl-prev").addEventListener("click", () => islSkip(-1));
$("isl-next").addEventListener("click", () => islSkip(1));

const streak = $("streak");
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
async function runStreak() {
  const end = 0.64;
  const w = 0.18;
  for (;;) {
    const dur = (1.1 + 1.4 * end) * 1000;
    const t0 = performance.now();
    streak.style.opacity = "1";
    await new Promise((done) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const x = easeInOutSine(t) * end;
        streak.style.left = Math.max(0, x - w) * 100 + "%";
        streak.style.width = Math.min(w, x) * 100 + "%";
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    streak.style.opacity = "0";
    await wait(800);
  }
}
runStreak();

const LOOP = {
  off: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  all: '<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>',
  one: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>',
};
const LOOP_ORDER = ["off", "all", "one"];
let loopIx = 0;
const loopBtn = $("loop-btn");
loopBtn.innerHTML = svg(LOOP.off, 20);
loopBtn.addEventListener("click", async () => {
  loopIx = (loopIx + 1) % 3;
  const mode = LOOP_ORDER[loopIx];
  loopBtn.classList.add("swap");
  await wait(150);
  loopBtn.classList.remove("swap");
  loopBtn.classList.add("enter");
  loopBtn.innerHTML = svg(LOOP[mode], 20);
  loopBtn.classList.toggle("on", mode !== "off");
  requestAnimationFrame(() => requestAnimationFrame(() => loopBtn.classList.remove("enter")));
});

const srcplay = $("srcplay");
$("srcplay-ic").innerHTML = svg(PLAY, 24);
srcplay.addEventListener("click", () => {
  const on = srcplay.classList.toggle("on");
  $("srcplay-ic").innerHTML = svg(on ? PAUSE : PLAY, 24);
});

const PRESETS = ["#EDCF9B", "#F0A070", "#E07A5F", "#A8C686", "#7EB8C9", "#8FA8D8", "#C4A1E0", "#E8D5C4"];
const HUES = [38, 24, 12, 88, 192, 220, 276, 30];
const presetBox = $("acp-presets");
presetBox.innerHTML = PRESETS.map((c, i) => `<button type="button" aria-label="${c}" style="background:${c}"${i === 0 ? ' class="on"' : ""}></button>`).join("");
presetBox.querySelectorAll("button").forEach((b, i) => b.addEventListener("click", () => {
  presetBox.querySelectorAll("button").forEach((o) => o.classList.toggle("on", o === b));
  $("acp-hex").textContent = PRESETS[i].slice(1);
  $("acp-sv").style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${HUES[i]} 100% 50%)`;
  $("acp-knob").style.left = `calc(${(HUES[i] / 360) * 100}% - 8px)`;
  $("acp-knob").style.background = PRESETS[i];
}));

(function emptyStage() {
  const canvas = $("aes-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  let W = 0;
  let H = 0;
  function size() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);
  const dots = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: 0.002 + Math.random() * 0.004, r: Math.random() }));
  const walkers = Array.from({ length: 3 }, (_, i) => ({ x: 1 + i * 0.4, s: 0.0012 + i * 0.0003, y: 0.62 + i * 0.1 }));
  function figure(x, y, t) {
    const k = 9;
    const sw = Math.sin(t) * 0.6;
    ctx.beginPath();
    ctx.arc(x, y - k * 2.3, k * 0.45, 0, Math.PI * 2);
    ctx.moveTo(x, y - k * 1.8); ctx.lineTo(x, y - k * 0.6);
    ctx.moveTo(x, y - k * 0.6); ctx.lineTo(x + Math.sin(sw) * k, y + k * 0.4);
    ctx.moveTo(x, y - k * 0.6); ctx.lineTo(x - Math.sin(sw) * k, y + k * 0.4);
    ctx.moveTo(x, y - k * 1.5); ctx.lineTo(x - Math.sin(sw) * k * 0.8, y - k * 0.8);
    ctx.moveTo(x, y - k * 1.5); ctx.lineTo(x + Math.sin(sw) * k * 0.8, y - k * 0.8);
    ctx.stroke();
  }
  let f = 0;
  function frame() {
    f++;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgb(255 255 255 / 0.5)";
    for (const d of dots) {
      d.x -= d.s;
      if (d.x < -0.05) { d.x = 1.05; d.y = Math.random(); }
      ctx.beginPath();
      ctx.arc(d.x * W, d.y * H, 0.6 + (1 - d.x) * 2.6 * d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    for (const w of walkers) {
      w.x -= w.s;
      if (w.x < -0.05) w.x = 1.05;
      figure(w.x * W, w.y * H, f * 0.18);
    }
    requestAnimationFrame(frame);
  }
  frame();
  setTimeout(() => $("aes-copy").classList.add("on"), 1200);
})();

const pcfCenter = $("pcf-center");
const VOL = '<path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>';
document.querySelectorAll("[data-pcf]").forEach((b) => b.addEventListener("click", () => {
  const k = b.dataset.pcf;
  if (k === "l" || k === "r") {
    const el = $("pcf-" + k);
    el.classList.remove("on");
    void el.offsetWidth;
    el.classList.add("on");
    return;
  }
  pcfCenter.innerHTML = k === "vol"
    ? `<span class="pcf-chip">64%</span><span class="pcf-disc">${svg(VOL, 28)}</span>`
    : `<span class="pcf-disc">${svg(PAUSE, 28)}</span>`;
  pcfCenter.classList.remove("on");
  void pcfCenter.offsetWidth;
  pcfCenter.classList.add("on");
}));

const pvCard = $("pv-card");
const pvBtn = $("pv-btn");
pvBtn.innerHTML = svg(PLAY, 18);
pvBtn.addEventListener("click", () => {
  const on = pvCard.classList.toggle("on");
  pvBtn.innerHTML = svg(on ? PAUSE : PLAY, 18);
});

const like = $("like");
like.insertAdjacentHTML("beforeend", [18, 21, 24, 18, 21].map((r, i) => {
  const a = -Math.PI / 2 + (i - 2) * 0.62;
  return `<i class="like-p" style="--x:${(Math.cos(a) * r).toFixed(1)}px;--y:${(Math.sin(a) * r * 0.75).toFixed(1)}px;--s:${1 + (i % 2) * 0.4};--delay:${i * 40}ms;--d:${i % 2 ? 700 : 620}ms"></i>`;
}).join(""));
like.addEventListener("click", () => {
  const on = like.classList.toggle("on");
  like.classList.remove("burst");
  if (on) { void like.offsetWidth; like.classList.add("burst"); }
});

const scrubBar = $("scrub-bar");
const scrubPop = $("scrub-pop");
const FRAMES = ["cv1", "cv2", "cv3", "cv4", "cv5", "cv6"];
function scrubAt(clientX) {
  const r = scrubBar.getBoundingClientRect();
  const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const half = 104 / r.width;
  scrubPop.style.left = Math.min(1 - half, Math.max(half, t)) * 100 + "%";
  const secs = Math.round(t * 724);
  $("scrub-t").textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  $("scrub-frame").className = FRAMES[Math.min(5, Math.floor(t * 6))];
}
$("scrub-wrap").addEventListener("pointermove", (e) => scrubAt(e.clientX));

$("codep").querySelector(".codep-head").addEventListener("click", () => $("codep").classList.toggle("open"));

(function radial() {
  const el = $("radial");
  const ICON = [
    '<path d="M12 15V3M7 10l5 5 5-5M5 21h14"/>',
    '<circle cx="8" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M11 18V5l10-2v13"/>',
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  ];
  const n = ICON.length;
  const gap = 0.035;
  const pt = (r, a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
  const arc = (r0, r1, a0, a1) =>
    `M${pt(r1, a0)} A${r1} ${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
  el.innerHTML = ICON.map((ic, i) => {
    const a0 = -Math.PI / 2 - Math.PI / n + (i / n) * Math.PI * 2 + gap;
    const a1 = a0 + (Math.PI * 2) / n - gap * 2;
    const mid = (a0 + a1) / 2;
    const cx = Math.cos(mid) * 93;
    const cy = Math.sin(mid) * 93;
    return `<g><path class="ring" d="${arc(128, 140, a0, a1)}"/><path class="wedge" d="${arc(66, 120, a0, a1)}"/><g class="ico" transform="translate(${(cx - 11).toFixed(1)} ${(cy - 11).toFixed(1)}) scale(0.92)">${ic}</g></g>`;
  }).join("") + '<circle class="center" r="62"/>';
})();
