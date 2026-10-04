/* =========================================================
   ANIME NEURIX · player-extras.js
   Premium OTT features layered on top of the existing Watch
   Page player (js/watch-loader.js). This file only ever reads
   the existing <video id="w-video"> and its wrap/fullscreen
   button — it does not touch Backblaze streaming, routing,
   layout, or any other existing behavior.

   Public API called by watch-loader.js after every episode load:
     AnimeHub.playerExtras.applyEpisode({
       item, ep, hasVideo, prevEp, nextEp, goNext, goPrev
     })
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  const SPEED_KEY = "animehub:playback-speed";
  const THEATER_KEY = "animehub:theater-mode";
  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const PROGRESS_SAVE_INTERVAL_MS = 4000;
  const AUTO_NEXT_SECONDS = 10;
  const RESUME_MIN_SECONDS = 8;

  let inited = false;
  const els = {};
  const state = {
    item: null, ep: null, animeId: null, season: null, episode: null,
    hasNext: false, hasPrev: false, nextEp: null, goNext: null, goPrev: null,
    lastSaveAt: 0, autoNextInterval: null, youtubeMode: false,
  };

  function byId(id) { return document.getElementById(id); }

  function fmtTime(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /* ---------------------------------------------------------
     One-time DOM setup — everything here is created dynamically
     so watch.html itself only needed two <link>/<script> lines.
     --------------------------------------------------------- */
  function ensureUI() {
    if (inited) return;
    const wrap = byId("w-player-wrap");
    const video = byId("w-video");
    const fsBtn = byId("w-fullscreen-btn");
    if (!wrap || !video) return;
    inited = true;

    els.wrap = wrap;
    els.video = video;

    /* --- Feature 8: dynamic cinematic background (reuses existing banner) ---
       Fixed to the viewport and inserted as the very first element in <body>
       so it always paints behind the navbar, hero, player, and every other
       element on the page — none of which have an opaque background of their
       own, so this shows through everywhere except solid UI surfaces. */
    document.body.insertAdjacentHTML("afterbegin", `
      <div id="pe-cinematic-backdrop" aria-hidden="true">
        <div class="pe-backdrop-img" id="pe-backdrop-img"></div>
        <div class="pe-backdrop-vignette"></div>
        <div class="pe-backdrop-overlay"></div>
      </div>`);
    els.backdrop = byId("pe-cinematic-backdrop");
    els.backdropImg = byId("pe-backdrop-img");

    /* --- Feature 6/7/5: control cluster (speed, theater, PiP) + existing fullscreen button --- */
    if (fsBtn) {
      const row = document.createElement("div");
      row.className = "pe-controls-row";
      fsBtn.parentNode.insertBefore(row, fsBtn);
      row.insertAdjacentHTML("beforeend", `
        <div class="pe-speed-wrap">
          <button class="watch-fullscreen-btn pe-speed-btn" id="pe-speed-btn" aria-label="Playback speed" title="Playback speed">
            <span id="pe-speed-label">1x</span>
          </button>
          <div class="pe-speed-menu" id="pe-speed-menu"></div>
        </div>
        <button class="watch-fullscreen-btn" id="pe-theater-btn" aria-label="Theater mode" title="Theater mode">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/></svg>
        </button>
        <button class="watch-fullscreen-btn" id="pe-pip-btn" style="display:none;" aria-label="Picture in Picture" title="Picture in Picture">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12.5" y="12" width="6.5" height="4.5" rx="1" fill="currentColor" stroke="none"/></svg>
        </button>`);
      row.appendChild(fsBtn); // move the existing fullscreen button into the row, kept last
      els.controlsRow = row; // Feature: YouTube mode hides this whole cluster (speed/theater/PiP/fullscreen) in one shot
      els.speedBtn = byId("pe-speed-btn");
      els.speedMenu = byId("pe-speed-menu");
      els.speedLabel = byId("pe-speed-label");
      els.theaterBtn = byId("pe-theater-btn");
      els.pipBtn = byId("pe-pip-btn");
    }

    /* --- Feature 2/9: skip intro / skip outro buttons --- */
    /* --- Feature 1: continue-watching resume prompt --- */
    /* --- Feature 3: auto-next-episode countdown popup --- */
    wrap.insertAdjacentHTML("beforeend", `
      <button class="pe-skip-btn" id="pe-skip-intro-btn" style="display:none;">Skip Intro <span>⏭</span></button>
      <button class="pe-skip-btn" id="pe-skip-outro-btn" style="display:none;">Skip Credits <span>⏭</span></button>
      <div class="pe-resume-prompt" id="pe-resume-prompt" style="display:none;">
        <div class="pe-resume-box">
          <p id="pe-resume-text">Resume from 0:00</p>
          <div class="pe-resume-actions">
            <button class="btn btn-glow btn-sm" id="pe-resume-btn">Resume</button>
            <button class="btn btn-ghost btn-sm" id="pe-start-over-btn">Start Over</button>
          </div>
        </div>
      </div>
      <div class="pe-autonext-overlay" id="pe-autonext-overlay" style="display:none;">
        <div class="pe-autonext-box">
          <div class="pe-autonext-thumb-wrap"><img id="pe-autonext-thumb" src="" alt=""></div>
          <div class="pe-autonext-info">
            <span class="pe-autonext-label">Next Episode In</span>
            <div class="pe-autonext-count" id="pe-autonext-count">${AUTO_NEXT_SECONDS}</div>
            <div class="pe-autonext-title" id="pe-autonext-title"></div>
            <div class="pe-autonext-actions">
              <button class="btn btn-glow btn-sm" id="pe-playnow-btn">Play Now</button>
              <button class="btn btn-ghost btn-sm" id="pe-cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      </div>`);

    els.skipIntroBtn = byId("pe-skip-intro-btn");
    els.skipOutroBtn = byId("pe-skip-outro-btn");
    els.resumePrompt = byId("pe-resume-prompt");
    els.resumeText = byId("pe-resume-text");
    els.resumeBtn = byId("pe-resume-btn");
    els.startOverBtn = byId("pe-start-over-btn");
    els.autonextOverlay = byId("pe-autonext-overlay");
    els.autonextThumb = byId("pe-autonext-thumb");
    els.autonextTitle = byId("pe-autonext-title");
    els.autonextCount = byId("pe-autonext-count");
    els.playNowBtn = byId("pe-playnow-btn");
    els.cancelBtn = byId("pe-cancel-btn");

    bindEvents();
    applyTheaterFromStorage();
  }

  /* ---------------------------------------------------------
     Feature 2 & 9: Skip Intro / Skip Outro
     --------------------------------------------------------- */
  function handleSkipButtons() {
    if (state.youtubeMode) return; // Backblaze-only OTT feature
    const ep = state.ep;
    const t = els.video.currentTime;
    if (!ep) return;
    if (typeof ep.introStart === "number" && typeof ep.introEnd === "number" && ep.introEnd > ep.introStart) {
      els.skipIntroBtn.style.display = (t >= ep.introStart && t < ep.introEnd) ? "flex" : "none";
    }
    if (typeof ep.outroStart === "number" && typeof ep.outroEnd === "number" && ep.outroEnd > ep.outroStart) {
      els.skipOutroBtn.style.display = (t >= ep.outroStart && t < ep.outroEnd) ? "flex" : "none";
    }
  }

  /* ---------------------------------------------------------
     Feature 1: Continue Watching real progress
     --------------------------------------------------------- */
  function saveProgress(force) {
    if (state.youtubeMode) return; // Continue Watching is a Backblaze-only OTT feature
    const v = els.video;
    if (!state.animeId || !v.duration || !isFinite(v.duration)) return;
    const now = Date.now();
    if (!force && now - state.lastSaveAt < PROGRESS_SAVE_INTERVAL_MS) return;
    state.lastSaveAt = now;
    if (AnimeHub.continueWatching && AnimeHub.continueWatching.recordProgress) {
      AnimeHub.continueWatching.recordProgress(
        state.animeId, state.season, state.episode,
        v.currentTime, v.duration,
        (state.ep && state.ep.thumbnail) || (state.item && state.item.banner) || ""
      );
    }
  }

  function maybeShowResumePrompt() {
    els.resumePrompt.style.display = "none";
    if (!AnimeHub.continueWatching || !AnimeHub.continueWatching.getEntry) return;
    const entry = AnimeHub.continueWatching.getEntry(state.animeId);
    if (!entry) return;
    if (String(entry.season) !== String(state.season) || String(entry.episode) !== String(state.episode)) return;
    if (!entry.time || entry.time < RESUME_MIN_SECONDS) return;
    if (entry.percent >= 95) return;
    els.resumeText.textContent = `Resume from ${fmtTime(entry.time)}`;
    els.resumePrompt.dataset.resumeTime = String(entry.time);
    els.resumePrompt.style.display = "flex";
  }

  /* ---------------------------------------------------------
     Feature 3: Auto Next Episode
     --------------------------------------------------------- */
  function clearAutoNextTimer() {
    if (state.autoNextInterval) { clearInterval(state.autoNextInterval); state.autoNextInterval = null; }
  }
  function hideAutoNext() {
    clearAutoNextTimer();
    if (els.autonextOverlay) els.autonextOverlay.style.display = "none";
  }
  function showAutoNextPopup() {
    if (!state.hasNext || !state.goNext) return;
    const nextEp = state.nextEp;
    els.autonextThumb.src = (nextEp && (nextEp.thumbnail || (state.item && state.item.banner))) || "";
    els.autonextTitle.textContent = nextEp ? `${nextEp.episodeNumber}. ${nextEp.title || "Next Episode"}` : "Next Episode";
    let count = AUTO_NEXT_SECONDS;
    els.autonextCount.textContent = String(count);
    els.autonextOverlay.style.display = "flex";
    clearAutoNextTimer();
    state.autoNextInterval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearAutoNextTimer();
        els.autonextOverlay.style.display = "none";
        state.goNext && state.goNext(true); // true = autoplay next episode
        return;
      }
      els.autonextCount.textContent = String(count);
    }, 1000);
  }

  function handleEnded() {
    if (state.youtubeMode) return; // Auto Next Episode is a Backblaze-only OTT feature
    saveProgress(true);
    if (state.hasNext && state.goNext) {
      showAutoNextPopup();
    } else {
      // No next episode — just reset so the poster/play button reappear.
      els.video.load();
    }
  }

  /* ---------------------------------------------------------
     Feature 4: Keyboard shortcuts
     --------------------------------------------------------- */
  function isTypingInField() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (isTypingInField() || e.ctrlKey || e.metaKey || e.altKey) return;
      const v = els.video;
      if (!v || v.style.display === "none") return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          v.paused ? v.play().catch(() => {}) : v.pause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case "ArrowRight":
          e.preventDefault();
          v.currentTime = Math.min(v.duration || v.currentTime, v.currentTime + 10);
          break;
        case "ArrowUp":
          e.preventDefault();
          v.volume = Math.min(1, +(v.volume + 0.1).toFixed(2));
          break;
        case "ArrowDown":
          e.preventDefault();
          v.volume = Math.max(0, +(v.volume - 0.1).toFixed(2));
          break;
        case "f": case "F":
          if (AnimeHub.playerFullscreen && AnimeHub.playerFullscreen.toggle) AnimeHub.playerFullscreen.toggle();
          break;
        case "m": case "M":
          v.muted = !v.muted;
          break;
        case "n": case "N":
          if (state.hasNext && state.goNext) state.goNext();
          break;
        case "p": case "P":
          if (state.hasPrev && state.goPrev) state.goPrev();
          break;
        case "Home":
          e.preventDefault();
          v.currentTime = 0;
          break;
        case "End":
          e.preventDefault();
          if (v.duration) v.currentTime = Math.max(0, v.duration - 0.25);
          break;
        default:
          if (/^[0-9]$/.test(e.key) && v.duration) {
            v.currentTime = (Number(e.key) / 10) * v.duration;
          }
      }
    });
  }

  /* ---------------------------------------------------------
     Feature 5: Picture in Picture
     --------------------------------------------------------- */
  function bindPip() {
    if (!els.pipBtn) return;
    if (!document.pictureInPictureEnabled || typeof els.video.requestPictureInPicture !== "function") {
      els.pipBtn.style.display = "none";
      return;
    }
    els.pipBtn.style.display = "flex";
    els.pipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      } else {
        els.video.requestPictureInPicture().catch(() => { /* browser blocked it — ignore gracefully */ });
      }
    });
  }

  /* ---------------------------------------------------------
     Feature 6: Theater Mode
     --------------------------------------------------------- */
  function applyTheaterFromStorage() {
    const on = localStorage.getItem(THEATER_KEY) === "1";
    document.body.classList.toggle("pe-theater-mode", on);
    if (els.theaterBtn) els.theaterBtn.classList.toggle("is-active", on);
  }
  function bindTheater() {
    if (!els.theaterBtn) return;
    els.theaterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const on = !document.body.classList.contains("pe-theater-mode");
      document.body.classList.toggle("pe-theater-mode", on);
      els.theaterBtn.classList.toggle("is-active", on);
      localStorage.setItem(THEATER_KEY, on ? "1" : "0");
    });
  }

  /* ---------------------------------------------------------
     Feature 7: Playback speed
     --------------------------------------------------------- */
  function applySpeedFromStorage() {
    const saved = parseFloat(localStorage.getItem(SPEED_KEY) || "1");
    const speed = SPEEDS.includes(saved) ? saved : 1;
    els.video.playbackRate = speed;
    if (els.speedLabel) els.speedLabel.textContent = speed + "x";
  }
  function bindSpeed() {
    if (!els.speedBtn || !els.speedMenu) return;
    els.speedMenu.innerHTML = SPEEDS.map((s) => `<button type="button" data-speed="${s}">${s}x</button>`).join("");
    els.speedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      els.speedMenu.classList.toggle("open");
    });
    els.speedMenu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-speed]");
      if (!b) return;
      const speed = parseFloat(b.dataset.speed);
      els.video.playbackRate = speed;
      els.speedLabel.textContent = speed + "x";
      localStorage.setItem(SPEED_KEY, String(speed));
      els.speedMenu.classList.remove("open");
    });
    document.addEventListener("click", () => els.speedMenu.classList.remove("open"));
    els.video.addEventListener("loadedmetadata", applySpeedFromStorage);
  }

  /* ---------------------------------------------------------
     Feature 8: Dynamic cinematic background
     --------------------------------------------------------- */
  function applyBackdrop(url) {
    if (!els.backdropImg || !url) return;
    const cssUrl = `url("${url}")`;
    if (els.backdropImg.dataset.currentUrl === url) return; // same anime — skip the fade, nothing changed
    els.backdropImg.dataset.currentUrl = url;
    els.backdropImg.style.opacity = "0";
    // Same URL the page already loads for the banner/poster — no extra bandwidth.
    els.backdropImg.style.backgroundImage = cssUrl;
    requestAnimationFrame(() => { els.backdropImg.style.opacity = "1"; });
  }

  /* ---------------------------------------------------------
     Wire up everything that only needs to be bound once
     --------------------------------------------------------- */
  function bindEvents() {
    bindKeyboard();
    bindPip();
    bindTheater();
    bindSpeed();

    els.resumeBtn.addEventListener("click", () => {
      const t = parseFloat(els.resumePrompt.dataset.resumeTime || "0");
      if (t) els.video.currentTime = t;
      els.resumePrompt.style.display = "none";
    });
    els.startOverBtn.addEventListener("click", () => {
      els.video.currentTime = 0;
      els.resumePrompt.style.display = "none";
    });

    els.skipIntroBtn.addEventListener("click", () => {
      if (state.ep && typeof state.ep.introEnd === "number") els.video.currentTime = state.ep.introEnd;
      els.skipIntroBtn.style.display = "none";
    });
    els.skipOutroBtn.addEventListener("click", () => {
      if (state.ep && typeof state.ep.outroEnd === "number") els.video.currentTime = state.ep.outroEnd;
      els.skipOutroBtn.style.display = "none";
    });

    els.playNowBtn.addEventListener("click", () => {
      hideAutoNext();
      state.goNext && state.goNext(true);
    });
    els.cancelBtn.addEventListener("click", () => {
      hideAutoNext();
      els.video.load(); // stay here, reset to paused poster state
    });

    els.video.addEventListener("timeupdate", () => {
      handleSkipButtons();
      saveProgress(false);
    });
    els.video.addEventListener("pause", () => saveProgress(true));
    els.video.addEventListener("ended", handleEnded);
    window.addEventListener("beforeunload", () => saveProgress(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden) saveProgress(true); });

    // Requirements 7/8: pause + hide the cinematic backdrop the instant real
    // browser fullscreen engages (saves GPU/CPU while it can't even be seen),
    // and bring it back immediately on exit.
    function syncBackdropWithFullscreen() {
      if (!els.backdrop) return;
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement ||
        document.mozFullScreenElement || document.msFullscreenElement || null;
      const isFs = !!fsEl || els.video.webkitDisplayingFullscreen;
      els.backdrop.classList.toggle("pe-backdrop-paused", isFs);
    }
    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
      .forEach((evt) => document.addEventListener(evt, syncBackdropWithFullscreen));
    els.video.addEventListener("webkitendfullscreen", syncBackdropWithFullscreen); // iOS Safari
  }

  /* ---------------------------------------------------------
     Public API — called by watch-loader.js after every episode load
     --------------------------------------------------------- */
  function applyEpisode(ctx) {
    ensureUI();
    if (!els.video) return;

    hideAutoNext();
    if (els.skipIntroBtn) els.skipIntroBtn.style.display = "none";
    if (els.skipOutroBtn) els.skipOutroBtn.style.display = "none";
    if (els.resumePrompt) els.resumePrompt.style.display = "none";

    state.item = ctx.item;
    state.ep = ctx.ep;
    state.animeId = ctx.item.id;
    state.season = ctx.ep.seasonNumber;
    state.episode = ctx.ep.episodeNumber;
    state.hasNext = !!ctx.nextEp;
    state.nextEp = ctx.nextEp;
    state.hasPrev = !!ctx.prevEp;
    state.goNext = ctx.goNext;
    state.goPrev = ctx.goPrev;
    state.lastSaveAt = 0;
    state.youtubeMode = !!ctx.youtubeMode;

    // YouTube requirement: no custom OTT chrome at all — hide the entire
    // speed/theater/PiP/fullscreen cluster in one shot (the fullscreen
    // button lives inside this row, so it's covered too). Backblaze always
    // gets the cluster back.
    if (els.controlsRow) els.controlsRow.style.display = state.youtubeMode ? "none" : "";

    // Dynamic Background stays active for BOTH providers — this call is
    // intentionally unconditional.
    applyBackdrop((ctx.item && (ctx.item.detailBanner || ctx.item.banner)) || "");

    if (!state.youtubeMode) {
      applySpeedFromStorage();
      if (ctx.hasVideo) maybeShowResumePrompt(); // Continue Watching resume is Backblaze-only
    }
  }

  AnimeHub.playerExtras = { applyEpisode };
})();