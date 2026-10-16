const { JSDOM } = require("jsdom");
const fs = require("fs");
const P = (process.env.PROJECT_DIR || process.cwd()).replace(/\/?$/, "/");
const data = JSON.parse(fs.readFileSync(P + "data/anime-data.json", "utf8"));

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, extra !== undefined ? "→ " + JSON.stringify(extra) : ""); }
}

// ---- Fake hls.js: records calls, lets the test fire events ----
function makeFakeHls({ supported = true } = {}) {
  const instances = [];
  class FakeHls {
    constructor(cfg) {
      this.cfg = cfg; this.handlers = {}; this.destroyed = false; this.loaded = []; this.attached = null;
      this.levels = []; this.audioTracks = []; this._audioTrack = -1; this.currentLevel = -1; this.startLoads = 0; this.recovers = 0;
      instances.push(this);
    }
    on(e, fn) { (this.handlers[e] = this.handlers[e] || []).push(fn); }
    emit(e, d) { (this.handlers[e] || []).forEach((f) => f(e, d)); }
    loadSource(u) { this.loaded.push(u); }
    attachMedia(v) { this.attached = v; }
    destroy() { this.destroyed = true; }
    startLoad() { this.startLoads++; }
    recoverMediaError() { this.recovers++; }
    get audioTrack() { return this._audioTrack; }
    set audioTrack(v) { this._audioTrack = v; }
  }
  FakeHls.isSupported = () => supported;
  FakeHls.Events = { MANIFEST_PARSED: "mp", LEVEL_SWITCHED: "ls", AUDIO_TRACKS_UPDATED: "atu", AUDIO_TRACK_SWITCHED: "ats", ERROR: "err" };
  FakeHls.ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError", OTHER_ERROR: "otherError" };
  FakeHls.ErrorDetails = { MANIFEST_LOAD_ERROR: "manifestLoadError", MANIFEST_LOAD_TIMEOUT: "manifestLoadTimeOut", MANIFEST_PARSING_ERROR: "manifestParsingError" };
  FakeHls.instances = instances;
  return FakeHls;
}

function bootDom({ hlsSupported = true, withHls = true, url = "watch.html?id=lord-of-mysteries&season=1&episode=1" } = {}) {
  let html = fs.readFileSync(P + "watch.html", "utf8");
  html = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<link[^>]*>/g, "");
  const dom = new JSDOM(html, { url: "http://localhost/" + url, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  // jsdom doesn't implement media playback — stub the bits the player code calls
  w.HTMLMediaElement.prototype.load = function () { this._loads = (this._loads || 0) + 1; };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  // Minimal TextTrack so <track> elements behave like a browser's
  Object.defineProperty(w.HTMLTrackElement.prototype, "track", {
    get() { if (!this._tt) { const l = {}; this._tt = { mode: "disabled", activeCues: [], addEventListener: (e, f) => (l[e] = f), removeEventListener: () => {}, _l: l }; } return this._tt; },
  });
  w.scrollTo = () => {};
  const store = {}; // localStorage works in jsdom with a real URL
  // AnimeHub stubs for the pieces of the site we don't have (anime-loader.js etc.)
  w.AnimeHub = {
    data: {
      fetchData: () => Promise.resolve(data),
      getById: (id) => data.anime.find((a) => a.id === id),
      getByGenre: () => [],
    },
    render: { renderCard: () => "" },
    util: { extractYoutubeId: (raw) => { const m = String(raw).match(/([A-Za-z0-9_-]{11})/); return m ? m[1] : ""; } },
  };
  if (withHls) w.Hls = makeFakeHls({ supported: hlsSupported });
  ["js/player-extras.js", "js/hls-player.js", "js/watch-loader.js", "js/custom-controls.js"].forEach((f) => w.eval(fs.readFileSync(P + f, "utf8")));
  return dom;
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s);
const items = (w, kind) => Array.from(w.document.querySelectorAll(`.hp-menu[data-hp="${kind}"] .hp-item`)).map((i) => ({ label: i.querySelector(".hp-label").textContent, sub: (i.querySelector(".hp-sub") || {}).textContent || "", checked: i.getAttribute("aria-checked") === "true" }));

(async () => {
  /* ================= 1. Episode 1 → HLS path ================= */
  console.log("\n[1] Lord of Mysteries · Episode 1 (HLS)");
  let dom = bootDom();
  await tick();
  let w = dom.window, H = w.Hls;
  ok(H.instances.length === 1, "exactly one Hls instance created");
  const hls = H.instances[0];
  ok(hls.loaded.length === 1 && hls.loaded[0] === "https://f005.backblazeb2.com/file/animeneurix/anime/Lord-of-Mysteries/Episode-01/master.m3u8", "loadSource got the Episode 1 master playlist", hls.loaded);
  ok(hls.attached === $(w, "#w-video"), "hls attached to the existing #w-video element");
  ok($(w, "#w-video").style.display === "block", "video element shown");
  ok($(w, "#w-video").getAttribute("poster").endsWith("logo-horizontal.png"), "poster uses fallback artwork");
  ok($(w, "#w-fallback").style.display === "none", "fallback panel hidden");
  const tracks = w.document.querySelectorAll("#w-video track");
  ok(tracks.length === 1 && tracks[0].src.endsWith("/subtitles/english.vtt") && tracks[0].srclang === "en", "one <track> for the English VTT", Array.from(tracks).map((t) => t.src));
  ok(w.document.querySelector("#w-video source") === null, "no <source> MP4 element used for HLS");
  ok(!$(w, "#w-rating").textContent && $(w, "#w-meta-row .rating-pill").style.display === "none", "page renders with no rating (pill hidden, no crash)");
  ok($(w, "#w-year").style.display === "none", "empty release year hidden");

  // Before the manifest arrives: no quality/audio choices exist yet, subtitles do
  ok($(w, '.hp-btn[data-hp="quality"]').hidden && $(w, '.hp-btn[data-hp="audio"]').hidden, "quality/audio buttons hidden before manifest parsed");
  ok(!$(w, '.hp-btn[data-hp="subtitles"]').hidden, "subtitles button visible (external VTT configured)");

  /* ================= 2. Menus built from the manifest (shuffled order, dup variants) ================= */
  console.log("\n[2] Menus from manifest data");
  hls.levels = [
    { height: 360, bitrate: 600000 }, { height: 1080, bitrate: 4200000 }, { height: 480, bitrate: 900000 },
    { height: 720, bitrate: 2000000 }, { height: 720, bitrate: 1500000 },
  ];
  hls.emit("mp", { levels: hls.levels });
  hls.audioTracks = [{ id: 0, lang: "zh", name: "Chinese" }, { id: 1, lang: "hi", name: "Hindi" }, { id: 2, lang: "en", name: "English" }];
  hls._audioTrack = 1;
  hls.emit("atu", { audioTracks: hls.audioTracks });
  ok(!$(w, '.hp-btn[data-hp="quality"]').hidden && !$(w, '.hp-btn[data-hp="audio"]').hidden, "quality + audio buttons now visible");
  $(w, '.hp-btn[data-hp="quality"]').click();
  let q = items(w, "quality");
  ok(JSON.stringify(q.map((i) => i.label)) === JSON.stringify(["Auto", "1080p", "720p", "480p", "360p"]), "quality list = Auto + distinct heights, highest first", q.map((i) => i.label));
  ok(q[0].checked && q[1].sub === "Source", "Auto selected by default; top variant tagged Source", q);
  ok($(w, '.hp-btn[data-hp="quality"]').getAttribute("aria-expanded") === "true", "aria-expanded=true while open");
  // 720p must resolve to the higher-bitrate level index (3), not the duplicate (4)
  w.document.querySelectorAll('.hp-menu[data-hp="quality"] .hp-item')[2].click();
  ok(hls.currentLevel === 3, "choosing 720p sets currentLevel to the best 720p variant", hls.currentLevel);
  ok(!$(w, '.hp-menu[data-hp="quality"]').classList.contains("open"), "menu closes after selection");
  $(w, '.hp-btn[data-hp="quality"]').click();
  ok(items(w, "quality")[2].checked, "720p now shows the checkmark state");
  w.document.querySelectorAll('.hp-menu[data-hp="quality"] .hp-item')[0].click();
  ok(hls.currentLevel === -1, "choosing Auto sets currentLevel back to -1");

  $(w, '.hp-btn[data-hp="audio"]').click();
  let a = items(w, "audio");
  ok(JSON.stringify(a.map((i) => i.label)) === JSON.stringify(["Chinese", "Hindi", "English"]), "audio list follows the manifest (no hardcoded order)", a.map((i) => i.label));
  ok(a[1].checked && !a[0].checked && !a[2].checked, "currently active track (Hindi) is the checked one", a);
  w.document.querySelectorAll('.hp-menu[data-hp="audio"] .hp-item')[2].click();
  ok(hls.audioTrack === 2, "choosing English sets hls.audioTrack to that track's id", hls.audioTrack);
  ok(w.localStorage.getItem("animehub:audio-lang") === "en", "language preference remembered by language code");

  $(w, '.hp-btn[data-hp="subtitles"]').click();
  let s = items(w, "subtitles");
  ok(JSON.stringify(s.map((i) => i.label)) === JSON.stringify(["Off", "English"]) && s[0].checked, "subtitles menu = Off + English, Off selected", s);
  w.document.querySelectorAll('.hp-menu[data-hp="subtitles"] .hp-item')[1].click();
  ok(tracks[0].track.mode === "hidden", "English track enabled (hidden mode → rendered in our cue layer)", tracks[0].track.mode);
  ok($(w, '.hp-btn[data-hp="subtitles"]').classList.contains("is-active"), "subtitles button shows active state");
  tracks[0].track.activeCues = [{ getCueAsHTML: () => { const f = w.document.createDocumentFragment(); f.appendChild(w.document.createTextNode("Hello")); return f; } }];
  tracks[0].track._l.cuechange && tracks[0].track._l.cuechange();
  ok($(w, ".hp-cue-layer").textContent === "Hello", "active cue text rendered into the overlay");
  ok(w.localStorage.getItem("animehub:subtitle-lang") === "en", "subtitle choice remembered");

  /* ================= 3. Keyboard accessibility ================= */
  console.log("\n[3] Keyboard");
  const qBtn = $(w, '.hp-btn[data-hp="quality"]');
  qBtn.focus();
  qBtn.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  ok($(w, '.hp-menu[data-hp="quality"]').classList.contains("open"), "ArrowDown on the button opens the menu");
  ok(w.document.activeElement.classList.contains("hp-item") && w.document.activeElement.getAttribute("aria-checked") === "true", "focus lands on the selected item");
  const before = w.document.activeElement;
  let volumeTouched = false;
  w.document.addEventListener("keydown", () => { volumeTouched = true; }); // would be the player-extras shortcut listener
  before.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  ok(w.document.activeElement !== before && w.document.activeElement.classList.contains("hp-item"), "ArrowDown moves focus to the next item");
  ok(volumeTouched === false, "arrow keys inside the menu do NOT leak to the global player shortcuts");
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  ok(!$(w, '.hp-menu[data-hp="quality"]').classList.contains("open") && w.document.activeElement === qBtn, "Escape closes the menu and returns focus to its button");
  qBtn.click(); // open again, then click elsewhere
  w.document.body.click();
  ok(!$(w, '.hp-menu[data-hp="quality"]').classList.contains("open"), "clicking outside closes the menu");
  // custom-controls must not auto-hide the bar while a menu is open
  qBtn.click();
  ok(!!w.document.querySelector(".hp-menu.open"), "menu open marker present for custom-controls isBusy()");

  /* ================= 4. Episode 2 must NOT load Episode 1's playlist ================= */
  console.log("\n[4] Navigate to Episode 2 (not uploaded)");
  $(w, "#w-next-btn").click();
  await tick();
  ok(hls.destroyed === true, "previous HLS session destroyed on episode change");
  ok(H.instances.length === 1, "no new Hls instance for Episode 2");
  ok(H.instances.every((i) => i.loaded.length === 1), "loadSource was never called again", H.instances.map((i) => i.loaded));
  ok($(w, "#w-fallback").style.display === "flex", "graceful unavailable-stream panel shown");
  ok(/No stream source has been configured/.test($(w, "#w-fallback-text").textContent), "message: no stream configured", $(w, "#w-fallback-text").textContent);
  ok(!$(w, "#w-video").hasAttribute("src") && $(w, "#w-video").style.display === "none", "video element has no src and is hidden");
  ok(w.document.querySelectorAll("#w-video track").length === 0, "subtitle <track> from Episode 1 removed");
  ok(Array.from(w.document.querySelectorAll(".hp-btn")).every((b) => b.hidden), "quality/audio/subtitle buttons hidden");
  ok(w.location.search.includes("episode=2"), "URL moved to episode 2");
  // sweep every remaining episode
  for (let n = 3; n <= 13; n++) {
    $(w, "#w-next-btn").click(); await tick(5);
    if ($(w, "#w-fallback").style.display !== "flex" || H.instances.length !== 1) { ok(false, `episode ${n} unexpectedly started a stream`); break; }
    if (n === 13) ok(true, "episodes 3–13 all show the unavailable state; still only 1 Hls instance ever created");
  }
  ok($(w, "#w-next-btn").disabled === true, "Episode 13 is the last (Next disabled)");

  /* ================= 5. Back to Episode 1 works again ================= */
  console.log("\n[5] Return to Episode 1");
  w.history.pushState({}, "", "watch.html?id=lord-of-mysteries&season=1&episode=1");
  w.dispatchEvent(new w.PopStateEvent("popstate"));
  await tick();
  ok(H.instances.length === 2 && H.instances[1].loaded.length === 1 && H.instances[1].loaded[0].includes("Episode-01/master.m3u8"), "Episode 1 starts a fresh Hls session");
  ok($(w, "#w-fallback").style.display === "none", "fallback hidden again");

  /* ================= 6. Fatal errors ================= */
  console.log("\n[6] Errors");
  const h2 = H.instances[1];
  h2.emit("err", { fatal: true, type: "networkError", details: "manifestLoadError", response: { code: 404 } });
  ok($(w, "#w-fallback").style.display === "flex" && /couldn't be found/.test($(w, "#w-fallback-text").textContent), "404 manifest → clear 'couldn't be found' message", $(w, "#w-fallback-text").textContent);
  ok(h2.destroyed, "failed session destroyed");

  w.history.pushState({}, "", "watch.html?id=lord-of-mysteries&season=1&episode=1");
  w.dispatchEvent(new w.PopStateEvent("popstate")); await tick();
  const h3 = H.instances[2];
  h3.emit("err", { fatal: true, type: "networkError", details: "fragLoadError" });
  h3.emit("err", { fatal: true, type: "networkError", details: "fragLoadError" });
  ok(h3.startLoads === 2 && !h3.destroyed, "transient network errors retry via startLoad() (twice)");
  h3.emit("err", { fatal: true, type: "networkError", details: "fragLoadError" });
  ok(h3.destroyed && $(w, "#w-fallback").style.display === "flex", "persistent network error → falls back after retries");

  w.history.pushState({}, "", "watch.html?id=lord-of-mysteries&season=1&episode=1");
  w.dispatchEvent(new w.PopStateEvent("popstate")); await tick();
  const h4 = H.instances[3];
  h4.emit("err", { fatal: true, type: "mediaError", details: "bufferStalledError" });
  ok(h4.recovers === 1 && !h4.destroyed, "media error → recoverMediaError() attempted");
  h4.emit("err", { fatal: false, type: "networkError", details: "fragLoadError" });
  ok(!h4.destroyed, "non-fatal errors are ignored");

  /* ================= 7. Unsupported browser / missing library ================= */
  console.log("\n[7] Unsupported / missing library");
  dom = bootDom({ hlsSupported: false }); await tick(); w = dom.window;
  ok($(w, "#w-fallback").style.display === "flex" && /can't play adaptive/.test($(w, "#w-fallback-text").textContent), "no MSE + no native HLS → explains the browser can't play HLS", $(w, "#w-fallback-text").textContent);
  dom = bootDom({ withHls: false }); await tick(); w = dom.window;
  ok($(w, "#w-fallback").style.display === "flex" && /couldn't be loaded/.test($(w, "#w-fallback-text").textContent), "hls.js script missing → clear 'component couldn't be loaded' message", $(w, "#w-fallback-text").textContent);

  /* ================= 8. Existing providers untouched ================= */
  console.log("\n[8] Backward compatibility");
  dom = bootDom({ url: "watch.html?id=solo-leveling&season=1&episode=1" }); await tick(); w = dom.window;
  ok(w.Hls.instances.length === 0, "Backblaze MKV/MP4 episode never creates an Hls instance");
  const src = w.document.querySelector("#w-video source");
  ok(src && src.getAttribute("src").includes("Solo+Leveling/Season+1/Episode+1/"), "MP4/MKV still loaded via original <source> path", src && src.getAttribute("src"));
  ok($(w, "#w-video").style.display === "block", "video shown for MP4/MKV");
  ok(w.document.querySelectorAll(".hp-btn").length === 0 || Array.from(w.document.querySelectorAll(".hp-btn")).every((b) => b.hidden), "no HLS menus on a plain MP4 episode");
  const ytItem = JSON.parse(JSON.stringify(data.anime.find((a) => a.id === "solo-leveling")));
  ytItem.seasons[0].episodes[0].source = "youtube"; ytItem.seasons[0].episodes[0].videoUrl = "dQw4w9WgXcQ";
  dom = bootDom({ url: "watch.html?id=solo-leveling&season=1&episode=1" });
  dom.window.AnimeHub.data.getById = (id) => (id === "solo-leveling" ? ytItem : null);
  dom.window.history.pushState({}, "", "watch.html?id=solo-leveling&season=1&episode=1"); dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate")); await tick();
  ok($(dom.window, "#w-youtube-card").style.display === "flex" && dom.window.Hls.instances.length === 0, "YouTube episode still shows the thumbnail card, no HLS involvement");
  // backblaze + .m3u8 auto-detect
  const mixed = JSON.parse(JSON.stringify(data.anime.find((a) => a.id === "solo-leveling")));
  mixed.seasons[0].episodes[0].videoUrl = "https://example.com/x/master.m3u8?sig=1";
  dom = bootDom({ url: "watch.html?id=solo-leveling&season=1&episode=1" });
  dom.window.AnimeHub.data.getById = () => mixed;
  dom.window.history.pushState({}, "", "watch.html?id=solo-leveling&season=1&episode=1"); dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate")); await tick();
  ok(dom.window.Hls.instances.length === 1 && dom.window.Hls.instances[0].loaded[0].includes("master.m3u8"), "a 'backblaze' source with a .m3u8 URL is auto-detected as HLS");

  /* ================= 9. Data checks ================= */
  console.log("\n[9] Data");
  const refs = JSON.stringify(data).split("Lord-of-Mysteries/Episode-01/master.m3u8").length - 1;
  ok(refs === 1, "master playlist URL appears exactly once in the whole data file", refs);
  const lom = data.anime.find((a) => a.id === "lord-of-mysteries");
  const withUrl = lom.seasons[0].episodes.filter((e) => e.videoUrl || e.source || (e.subtitles && e.subtitles.length));
  ok(withUrl.length === 1 && withUrl[0].episodeNumber === 1, "only Episode 1 has any stream/subtitle fields set", withUrl.map((e) => e.episodeNumber));
  ok(lom.seasons[0].episodes.slice(1).every((e) => e.watchLink === "" && e.videoUrl === "" && e.source === ""), "Episodes 2–13: watchLink/source/videoUrl all empty");
  ok(lom.seasons[0].episodes.every((e, i) => e.title === "Episode " + (i + 1)), "neutral titles Episode 1…13");

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS CRASH", e); process.exit(2); });
