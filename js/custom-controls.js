/* =========================================================
   ANIME NEURIX · custom-controls.js
   Replaces the browser's native <video controls> UI with a
   custom Netflix/Crunchyroll-style control bar.

   Scope discipline: this file only ever reads/drives the
   existing #w-video / #w-player-wrap elements that already
   exist in watch.html on page load. It does NOT touch
   Backblaze streaming, routing, anime-data.json, or the data
   layer in js/watch-loader.js — it just adds a UI layer on
   top of the same persistent <video> element that survives
   across episode changes.

   Coexistence with js/player-extras.js:
   - Speed / Theater / PiP / Fullscreen buttons stay exactly
     where player-extras.js already created and bound them
     (#pe-controls-row). This file does not move or rebind
     them — it only visually shares the bottom strip via CSS.
   - Skip Intro / Skip Outro buttons are untouched; only their
     bottom offset is nudged up in custom-controls.css.
   - The "F" keyboard shortcut and dblclick-center both use the
     existing AnimeHub.playerFullscreen.toggle() exposed by
     js/watch-loader.js, so there is exactly one fullscreen
     implementation in the whole app.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  const HIDE_DELAY_MS = 3000;
  const SEEK_STEP_SECONDS = 10;

  let inited = false;
  const els = {};
  let isScrubbingSeek = false;
  let isScrubbingVolume = false;
  let hideTimer = null;

  function fmtTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function init() {
    if (inited) return;
    const wrap = document.getElementById("w-player-wrap");
    const video = document.getElementById("w-video");
    if (!wrap || !video) return;
    inited = true;

    els.wrap = wrap;
    els.video = video;

    // Belt-and-braces: make sure no native controls UI can ever surface,
    // regardless of what markup shipped or what any other script does.
    video.controls = false;
    video.removeAttribute("controls");
    video.addEventListener("contextmenu", (e) => e.preventDefault());
    video.addEventListener("dragstart", (e) => e.preventDefault());

    wrap.insertAdjacentHTML("beforeend", buildBarHTML());

    els.bar = document.getElementById("cc-bar");
    els.playBtn = document.getElementById("cc-play-btn");
    els.muteBtn = document.getElementById("cc-mute-btn");
    els.volume = document.getElementById("cc-volume");
    els.seek = document.getElementById("cc-seek");
    els.seekPlayed = document.getElementById("cc-seek-played");
    els.seekBuffered = document.getElementById("cc-seek-buffered");
    els.timeCurrent = document.getElementById("cc-time-current");
    els.timeDuration = document.getElementById("cc-time-duration");
    els.seekFlash = document.getElementById("cc-seek-flash");

    bindPlayPause();
    bindVolume();
    bindSeek();
    bindDoubleClickZones();
    bindSingleClick();
    bindAutoHide();
    mirrorVideoVisibility();

    // Keep controls state correct on the very first episode too.
    syncPlayIcon();
    syncVolumeUI();
  }

  function buildBarHTML() {
    return `
      <div class="cc-bar" id="cc-bar">
        <div class="cc-progress-row">
          <span class="cc-time" id="cc-time-current">0:00</span>
          <div class="cc-seek-wrap" id="cc-seek-wrap">
            <div class="cc-seek-track"></div>
            <div class="cc-seek-buffered" id="cc-seek-buffered"></div>
            <div class="cc-seek-played" id="cc-seek-played"></div>
            <input type="range" class="cc-seek" id="cc-seek" min="0" max="100" step="0.1" value="0" aria-label="Seek">
          </div>
          <span class="cc-time" id="cc-time-duration">0:00</span>
        </div>
        <div class="cc-buttons-row">
          <div class="cc-left-controls">
            <button type="button" class="cc-btn cc-play-btn" id="cc-play-btn" aria-label="Play">
              <svg class="cc-icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <svg class="cc-icon-pause" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
            </button>
            <div class="cc-volume-wrap">
              <button type="button" class="cc-btn cc-mute-btn" id="cc-mute-btn" aria-label="Mute">
                <svg class="cc-icon-vol-high" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 12a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z" opacity=".9"/><path d="M14 4.35v1.9c2.28.9 3.9 3.13 3.9 5.75s-1.62 4.85-3.9 5.75v1.9c3.4-.95 5.9-4.07 5.9-7.65S17.4 5.3 14 4.35z" opacity=".9"/></svg>
                <svg class="cc-icon-vol-low" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 12a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>
                <svg class="cc-icon-vol-mute" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M19 8.5L17.5 10 16 8.5 14.5 10 13 8.5l1.5-1.5L13 5.5 14.5 4 16 5.5 17.5 4 19 5.5 17.5 7z" transform="translate(0 5)"/></svg>
              </button>
              <input type="range" class="cc-volume" id="cc-volume" min="0" max="1" step="0.05" value="1" aria-label="Volume">
            </div>
          </div>
        </div>
        <div class="cc-seek-flash" id="cc-seek-flash"></div>
      </div>`;
  }

  /* ---------------------------------------------------------
     Play / Pause
     --------------------------------------------------------- */
  function syncPlayIcon() {
    if (!els.playBtn || !els.video) return;
    const playing = !els.video.paused && !els.video.ended;
    els.playBtn.classList.toggle("is-playing", playing);
    els.playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }
  function bindPlayPause() {
    els.playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (els.video.style.display === "none") return; // fallback state, no source loaded
      if (els.video.paused || els.video.ended) els.video.play().catch(() => {});
      else els.video.pause();
    });
    els.video.addEventListener("play", syncPlayIcon);
    els.video.addEventListener("pause", syncPlayIcon);
    els.video.addEventListener("ended", syncPlayIcon);
  }

  /* ---------------------------------------------------------
     Volume / Mute
     --------------------------------------------------------- */
  function syncVolumeUI() {
    if (!els.muteBtn || !els.video) return;
    const v = els.video;
    if (!isScrubbingVolume) els.volume.value = v.muted ? 0 : v.volume;
    const effective = v.muted ? 0 : v.volume;
    els.muteBtn.classList.toggle("cc-vol-off", effective === 0);
    els.muteBtn.classList.toggle("cc-vol-low", effective > 0 && effective < 0.5);
    els.muteBtn.setAttribute("aria-label", effective === 0 ? "Unmute" : "Mute");
  }
  function bindVolume() {
    els.muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.video.muted = !els.video.muted;
      if (!els.video.muted && els.video.volume === 0) els.video.volume = 0.5;
    });
    els.volume.addEventListener("mousedown", () => { isScrubbingVolume = true; });
    els.volume.addEventListener("touchstart", () => { isScrubbingVolume = true; }, { passive: true });
    ["mouseup", "touchend", "change"].forEach((evt) =>
      els.volume.addEventListener(evt, () => { isScrubbingVolume = false; }));
    els.volume.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = parseFloat(els.volume.value);
      els.video.volume = val;
      els.video.muted = val === 0;
    });
    els.video.addEventListener("volumechange", syncVolumeUI);
  }

  /* ---------------------------------------------------------
     Seek bar + time display + buffered range
     --------------------------------------------------------- */
  function updateBuffered() {
    const v = els.video;
    if (!v.duration || !isFinite(v.duration) || !v.buffered.length) return;
    const end = v.buffered.end(v.buffered.length - 1);
    els.seekBuffered.style.width = Math.min(100, (end / v.duration) * 100) + "%";
  }
  function bindSeek() {
    const v = els.video;
    v.addEventListener("loadedmetadata", () => {
      els.timeDuration.textContent = fmtTime(v.duration);
      els.seekBuffered.style.width = "0%";
      els.seekPlayed.style.width = "0%";
      els.seek.value = 0;
    });
    v.addEventListener("timeupdate", () => {
      els.timeCurrent.textContent = fmtTime(v.currentTime);
      if (!isScrubbingSeek && v.duration && isFinite(v.duration)) {
        const pct = (v.currentTime / v.duration) * 100;
        els.seek.value = pct;
        els.seekPlayed.style.width = pct + "%";
      }
    });
    v.addEventListener("progress", updateBuffered);

    els.seek.addEventListener("mousedown", () => { isScrubbingSeek = true; showControls(true); });
    els.seek.addEventListener("touchstart", () => { isScrubbingSeek = true; showControls(true); }, { passive: true });
    els.seek.addEventListener("input", (e) => {
      e.stopPropagation();
      if (!v.duration || !isFinite(v.duration)) return;
      const pct = parseFloat(els.seek.value);
      els.seekPlayed.style.width = pct + "%";
      els.timeCurrent.textContent = fmtTime((pct / 100) * v.duration);
      v.currentTime = (pct / 100) * v.duration;
    });
    ["mouseup", "touchend", "change"].forEach((evt) =>
      els.seek.addEventListener(evt, () => { isScrubbingSeek = false; }));
  }

  /* ---------------------------------------------------------
     Requirement 3: click / dblclick behavior
     - single click: never toggles play, just reveals controls
     - dblclick left third: -10s, right third: +10s, center: fullscreen
     --------------------------------------------------------- */
  function flashSeek(direction) {
    if (!els.seekFlash) return;
    els.seekFlash.textContent = direction === "back" ? `⏪ ${SEEK_STEP_SECONDS}s` : `${SEEK_STEP_SECONDS}s ⏩`;
    els.seekFlash.className = "cc-seek-flash cc-show " + (direction === "back" ? "cc-left" : "cc-right");
    clearTimeout(els.seekFlash._t);
    els.seekFlash._t = setTimeout(() => { els.seekFlash.classList.remove("cc-show"); }, 550);
  }
  function bindSingleClick() {
    // Single click never plays/pauses — it only wakes the control bar back
    // up, same as hovering. Buttons/inputs stop propagation themselves.
    els.video.addEventListener("click", () => showControls());
  }
  function bindDoubleClickZones() {
    els.video.addEventListener("dblclick", (e) => {
      e.preventDefault();
      const v = els.video;
      const rect = v.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const third = rect.width / 3;
      if (x < third) {
        v.currentTime = Math.max(0, v.currentTime - SEEK_STEP_SECONDS);
        flashSeek("back");
      } else if (x > third * 2) {
        v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + SEEK_STEP_SECONDS);
        flashSeek("forward");
      } else if (AnimeHub.playerFullscreen && AnimeHub.playerFullscreen.toggle) {
        AnimeHub.playerFullscreen.toggle();
      }
      showControls();
    });
  }

  /* ---------------------------------------------------------
     Requirement 4: auto-hide after 3s of inactivity, reappear on
     mousemove. Always stays visible while paused/not started, and
     never hides mid-scrub or while the speed menu is open.
     --------------------------------------------------------- */
  function isBusy() {
    return isScrubbingSeek || isScrubbingVolume ||
      (document.getElementById("pe-speed-menu") && document.getElementById("pe-speed-menu").classList.contains("open"));
  }
  function showControls(force) {
    if (!els.wrap) return;
    els.wrap.classList.remove("cc-hidden");
    clearTimeout(hideTimer);
    if (els.video.paused || els.video.ended) return; // stay visible until playback resumes
    hideTimer = setTimeout(() => {
      if (!isBusy() && !els.video.paused) els.wrap.classList.add("cc-hidden");
    }, HIDE_DELAY_MS);
    void force; // reserved for callers that want an immediate wake without other side effects
  }
  function bindAutoHide() {
    ["mousemove", "mouseenter", "touchstart", "keydown"].forEach((evt) =>
      els.wrap.addEventListener(evt, () => showControls(), { passive: true }));
    els.wrap.addEventListener("mouseleave", () => {
      if (!els.video.paused && !isBusy()) els.wrap.classList.add("cc-hidden");
    });
    els.video.addEventListener("play", () => showControls());
    els.video.addEventListener("pause", () => showControls());
    showControls();
  }

  /* ---------------------------------------------------------
     Hide the whole bar whenever watch-loader.js switches the
     player into its fallback/no-source state (video display:none),
     and show it again once a stream is loaded — mirrors the
     existing element without needing any change to watch-loader.js.
     --------------------------------------------------------- */
  function mirrorVideoVisibility() {
    function sync() {
      const visible = els.video.style.display !== "none";
      els.bar.style.display = visible ? "" : "none";
    }
    sync();
    new MutationObserver(sync).observe(els.video, { attributes: true, attributeFilter: ["style"] });
  }

  document.addEventListener("DOMContentLoaded", init);
})();