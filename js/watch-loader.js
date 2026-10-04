/* =========================================================
   ANIME NEURIX · watch-loader.js
   Powers watch.html — the dedicated Watch Page.
   URL shape: watch.html?id=<animeId>&season=<n>&episode=<n>
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  /* Mobile-only "Read more" toggle for the episode description. Desktop is
     untouched by mobile.css's clamp, so this button stays hidden there via
     CSS; on mobile it only appears when the text actually overflows the
     clamped height, so short descriptions never show a pointless button. */
  function initDescReadMore() {
    const desc = document.getElementById("w-ep-desc");
    if (!desc) return;
    let btn = document.getElementById("w-desc-toggle");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.id = "w-desc-toggle";
      btn.className = "w-desc-toggle";
      desc.insertAdjacentElement("afterend", btn);
    }
    desc.classList.remove("is-expanded");
    btn.textContent = "Read more";
    btn.style.display = "none";
    btn.onclick = () => {
      const expanded = desc.classList.toggle("is-expanded");
      btn.textContent = expanded ? "Read less" : "Read more";
    };
    // Measure after layout AND webfonts settle — a single rAF can fire
    // before Google Fonts finishes swapping in, which briefly changes
    // line height and would under-report whether the text overflows.
    const measure = () => {
      if (desc.scrollHeight > desc.clientHeight + 2) btn.style.display = "block";
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(measure));
    } else {
      requestAnimationFrame(measure);
    }
    setTimeout(measure, 300); // belt-and-suspenders for slow font/layout timing
  }

  function qs(name, fallback) {
    const v = new URLSearchParams(location.search).get(name);
    return v === null || v === "" ? fallback : v;
  }

  function flattenEpisodes(item) {
    if (item.category === "movie") {
      return [{
        seasonNumber: 1, episodeNumber: 1, title: item.title, duration: item.duration,
        description: item.description, thumbnail: item.banner, watchLink: item.watchLink,
        downloadLinks: item.downloadLinks, backblazeUrl: item.backblazeUrl || "",
        source: item.source || "", videoUrl: item.videoUrl || "",
        introStart: item.introStart, introEnd: item.introEnd,
        outroStart: item.outroStart, outroEnd: item.outroEnd,
      }];
    }
    const list = [];
    (item.seasons || []).forEach((season) => {
      (season.episodes || []).forEach((ep) => {
        list.push(Object.assign({}, ep, {
          seasonNumber: season.seasonNumber,
          backblazeUrl: ep.backblazeUrl || "",
          source: ep.source || "", videoUrl: ep.videoUrl || "",
        }));
      });
    });
    return list;
  }

  /* =========================================================
     Streaming Architecture: two providers — Backblaze & YouTube.
     Preferred data shape going forward (either on a movie object
     or an episode object):
       { "source": "backblaze", "videoUrl": "https://f005.backblazeb2.com/..." }
       { "source": "youtube",   "videoUrl": "dQw4w9WgXcQ" }  // video ID or full URL
     Backward compatible: episodes that only have the existing
     "backblazeUrl" field (the entire current anime-data.json)
     keep working exactly as before — no data migration needed.
     Note: "youtube" videoUrl/ID is never embedded — it's only used to
     build a https://www.youtube.com/watch?v=<id> link (see loadPlayer).
     ========================================================= */
  // extractYoutubeId now lives in anime-loader.js as AnimeHub.util.extractYoutubeId
  // (shared with the Problem #5 trailer player) — local alias kept so the
  // rest of this file's calls below don't need to change.
  function extractYoutubeId(raw) { return AnimeHub.util.extractYoutubeId(raw); }

  function resolveStream(ep) {
    const src = (ep.source || "").trim().toLowerCase();
    if (src === "youtube" && ep.videoUrl && ep.videoUrl.trim()) {
      return { source: "youtube", videoId: extractYoutubeId(ep.videoUrl) };
    }
    if (src === "backblaze" && ep.videoUrl && ep.videoUrl.trim()) {
      return { source: "backblaze", videoUrl: ep.videoUrl.trim() };
    }
    if (ep.backblazeUrl && ep.backblazeUrl.trim()) {
      return { source: "backblaze", videoUrl: ep.backblazeUrl.trim() }; // legacy field
    }
    return { source: null };
  }

  function findEpisode(flat, season, episode) {
    return flat.find((e) => String(e.seasonNumber) === String(season) && String(e.episodeNumber) === String(episode));
  }

  function buildEpisodeUrl(id, season, episode) {
    return `watch.html?id=${encodeURIComponent(id)}&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
  }

  function renderState(root) {
    root.innerHTML = '<div class="state-block"><div class="state-icon">🔍</div><h3>Title not found</h3><p>This anime or movie could not be located.</p><a class="btn btn-glow" href="index.html">Back to Home</a></div>';
  }

  function initWatchPage() {
    const root = document.getElementById("watch-root");
    if (!root) return;

    const id = qs("id", "");
    const state = { item: null, flat: [] };

    // Episode list uses one delegated, permanent listener that always reads
    // the current state — avoids rebinding/leaking listeners on re-render.
    const listEl = document.getElementById("w-episode-list");
    listEl.addEventListener("click", (evt) => {
      const a = evt.target.closest(".watch-ep-row");
      if (!a || !state.flat.length) return;
      evt.preventDefault();
      const target = state.flat[Number(a.dataset.i)];
      if (target) goTo(state.item.id, target.seasonNumber, target.episodeNumber);
    });

    AnimeHub.data.fetchData().then(() => {
      const item = AnimeHub.data.getById(id);
      if (!item) { renderState(root); return; }

      const flat = flattenEpisodes(item);
      if (!flat.length) { renderState(root); return; }

      const ep = findEpisode(flat, qs("season", "1"), qs("episode", "1")) || flat[0];
      render(item, flat, ep, flat.indexOf(ep));
    }).catch(() => renderState(root));

    function render(item, flat, ep, epIndex, autoplay) {
      state.item = item; state.flat = flat;
      document.title = `${ep.title || item.title} · Anime NeuriX`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", (ep.description || item.description || "").slice(0, 160));

      document.getElementById("w-banner-img").src = item.detailBanner || item.banner;
      document.getElementById("w-poster-img").src = item.poster;
      document.getElementById("w-poster-img").alt = item.title + " poster";
      document.getElementById("w-title").textContent = item.title;
      document.getElementById("w-eyebrow").textContent = item.category === "movie"
        ? "Movie"
        : `Season ${ep.seasonNumber} · Episode ${ep.episodeNumber}`;
      document.getElementById("w-ep-title").textContent = item.category === "movie" ? "" : `E${ep.episodeNumber} - ${ep.title || ""}`;
      document.getElementById("w-ep-desc").textContent = ep.description || item.description || "";
      initDescReadMore();
      document.getElementById("w-rating").textContent = item.rating.toFixed(1);
      document.getElementById("w-type").textContent = item.category === "movie" ? "Movie" : "Series";
      document.getElementById("w-year").textContent = item.releaseYear;
      document.getElementById("w-genres").innerHTML = (item.genres || [])
        .map((g) => `<a class="search-chip" href="genre.html?genre=${encodeURIComponent(g)}">${g}</a>`).join("");

      // Back button — prefer real history so filters/scroll position on the
      // details page are preserved; fall back to the details page directly.
      const backBtn = document.getElementById("w-back-btn");
      backBtn.onclick = () => {
        if (document.referrer && document.referrer.indexOf(location.host) !== -1 && history.length > 1) {
          history.back();
        } else {
          location.href = `anime-details.html?id=${encodeURIComponent(item.id)}`;
        }
      };

      // Download button reuses the existing, untouched download system.
      document.getElementById("w-download-btn").href =
        `download.html?id=${encodeURIComponent(item.id)}&season=${encodeURIComponent(ep.seasonNumber)}&episode=${encodeURIComponent(ep.episodeNumber)}`;

      // ---------- Problem #8: Like / Dislike ----------
      if (AnimeHub.votes) {
        const likeBtn = document.getElementById("w-like-btn");
        const dislikeBtn = document.getElementById("w-dislike-btn");
        const likeCountEl = document.getElementById("w-like-count");
        const dislikeCountEl = document.getElementById("w-dislike-count");
        function formatCount(n) { return n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n); }
        function paintVotes() {
          const s = AnimeHub.votes.getState(item.id, ep.seasonNumber, ep.episodeNumber);
          likeCountEl.textContent = formatCount(s.like);
          dislikeCountEl.textContent = formatCount(s.dislike);
          likeBtn.classList.toggle("is-active", s.vote === "like");
          dislikeBtn.classList.toggle("is-active", s.vote === "dislike");
          likeBtn.setAttribute("aria-pressed", String(s.vote === "like"));
          dislikeBtn.setAttribute("aria-pressed", String(s.vote === "dislike"));
        }
        likeBtn.onclick = () => { AnimeHub.votes.setVote(item.id, ep.seasonNumber, ep.episodeNumber, "like"); paintVotes(); };
        dislikeBtn.onclick = () => { AnimeHub.votes.setVote(item.id, ep.seasonNumber, ep.episodeNumber, "dislike"); paintVotes(); };
        paintVotes();
      }

      // ---------- Problem #8: 3-dot menu — View Series + Share Episode ----------
      const moreWrap = document.getElementById("w-more-wrap");
      document.getElementById("w-more-view-series").href = `anime-details.html?id=${encodeURIComponent(item.id)}`;
      document.getElementById("w-more-btn").onclick = () => moreWrap.classList.toggle("open");
      document.getElementById("w-more-share").onclick = () => {
        const shareData = { title: item.title, text: `Watch ${item.title} on Anime NeuriX`, url: location.href };
        if (navigator.share) navigator.share(shareData).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(() => AnimeHub.ui && AnimeHub.ui.toast && AnimeHub.ui.toast("Link copied"));
        moreWrap.classList.remove("open");
      };
      document.addEventListener("click", (e) => {
        if (!e.target.closest("#w-more-wrap")) moreWrap.classList.remove("open");
      });

      // Prev / next
      const prevBtn = document.getElementById("w-prev-btn");
      const nextBtn = document.getElementById("w-next-btn");
      const prevEp = flat[epIndex - 1];
      const nextEp = flat[epIndex + 1];
      prevBtn.disabled = !prevEp;
      nextBtn.disabled = !nextEp;
      prevBtn.onclick = () => prevEp && goTo(item.id, prevEp.seasonNumber, prevEp.episodeNumber);
      nextBtn.onclick = () => nextEp && goTo(item.id, nextEp.seasonNumber, nextEp.episodeNumber);

      // ---------- Problem #8: compact "Next Episode" card ----------
      const nextSection = document.getElementById("w-next-ep-section");
      if (nextEp && item.category !== "movie") {
        nextSection.style.display = "";
        document.getElementById("w-next-ep-card").href = buildEpisodeUrl(item.id, nextEp.seasonNumber, nextEp.episodeNumber);
        document.getElementById("w-next-ep-thumb").src = nextEp.thumbnail || item.banner;
        document.getElementById("w-next-ep-title").textContent = `${nextEp.episodeNumber}. ${nextEp.title || ""}`;
        document.getElementById("w-next-ep-duration").textContent = nextEp.duration || "";
        const nextDownloadBtn = document.getElementById("w-next-ep-download");
        nextDownloadBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          location.href = `download.html?id=${encodeURIComponent(item.id)}&season=${encodeURIComponent(nextEp.seasonNumber)}&episode=${encodeURIComponent(nextEp.episodeNumber)}`;
        };
      } else {
        nextSection.style.display = "none";
      }

      // ---------- Problem #8: "All Episodes" collapsed by default ----------
      const allEpToggle = document.getElementById("w-all-episodes-toggle");
      const allEpList = document.getElementById("w-episode-list");
      const allEpChev = document.getElementById("w-all-episodes-chev");
      if (allEpToggle && !allEpToggle._wired) {
        allEpToggle._wired = true;
        allEpToggle.addEventListener("click", () => {
          const willShow = allEpList.hidden;
          allEpList.hidden = !willShow;
          allEpChev.style.transform = willShow ? "rotate(180deg)" : "";
          if (willShow) allEpList.querySelector(".is-current")?.scrollIntoView({ block: "nearest" });
        });
      }
      // Reusable callbacks handed to player-extras.js for the "N"/"P" keyboard
      // shortcuts and the auto-next-episode countdown popup.
      const goNext = (autoplayNext) => nextEp && goTo(item.id, nextEp.seasonNumber, nextEp.episodeNumber, !!autoplayNext);
      const goPrev = () => prevEp && goTo(item.id, prevEp.seasonNumber, prevEp.episodeNumber);

      // Episode list
      const listEl = document.getElementById("w-episode-list");
      listEl.innerHTML = flat.map((e, i) => `
        <a class="watch-ep-row ${i === epIndex ? "is-current" : ""}" href="${buildEpisodeUrl(item.id, e.seasonNumber, e.episodeNumber)}" data-i="${i}">
          <span class="ep-num">${e.episodeNumber}</span>
          <div class="ep-thumb"><img src="${e.thumbnail || item.banner}" alt="" loading="lazy"><span class="ep-play">▶</span></div>
          <div class="ep-info">
            <div class="ep-title">${item.category === "movie" ? item.title : (e.title || "Episode " + e.episodeNumber)} <span class="ep-duration">${e.duration || ""}</span></div>
            ${item.category !== "movie" ? `<p class="ep-desc">${e.description || ""}</p>` : ""}
          </div>
        </a>`).join("");
      // Reflect ✓ Watched state here too (read-only — the row is already a
      // full-row link into that episode; marking/unmarking happens via the
      // ⋮ menu on the anime-details.html episode list, and stays in sync
      // through the shared animehub:watched data layer).
      function paintWatchedRows() {
        if (!AnimeHub.watched) return;
        listEl.querySelectorAll(".watch-ep-row").forEach((row, i) => {
          const e = flat[i];
          row.classList.toggle("is-watched", AnimeHub.watched.has(item.id, e.seasonNumber, e.episodeNumber));
        });
      }
      paintWatchedRows();
      document.addEventListener("animehub:watched-changed", paintWatchedRows);
      document.dispatchEvent(new CustomEvent("animehub:watched-changed")); // repaint ✓ Watched badges for the freshly-rendered rows
      // Related
      const relatedItems = (AnimeHub.recommend && AnimeHub.recommend.recommendedForYou
        ? AnimeHub.recommend.recommendedForYou(12)
        : AnimeHub.data.getByGenre((item.genres || [])[0] || "")).filter((i) => i.id !== item.id).slice(0, 12);
      const relatedEl = document.getElementById("w-related");
      const relatedSection = document.getElementById("w-related-section");
      if (!relatedItems.length) { relatedSection.style.display = "none"; }
      else { relatedSection.style.display = ""; relatedEl.innerHTML = relatedItems.map(AnimeHub.render.renderCard).join(""); }

      if (AnimeHub.recommend && AnimeHub.recommend.trackView) AnimeHub.recommend.trackView(item.id);

      loadPlayer(item, ep, { prevEp, nextEp, goNext, goPrev, autoplay: !!autoplay });
    }

    function goTo(id, season, episode, autoplay) {
      const url = buildEpisodeUrl(id, season, episode);
      history.pushState({}, "", url);
      const item = AnimeHub.data.getById(id);
      const flat = flattenEpisodes(item);
      const ep = findEpisode(flat, season, episode) || flat[0];
      render(item, flat, ep, flat.indexOf(ep), autoplay);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    window.addEventListener("popstate", () => {
      const item = AnimeHub.data.getById(qs("id", id));
      if (!item) return;
      const flat = flattenEpisodes(item);
      const ep = findEpisode(flat, qs("season", "1"), qs("episode", "1")) || flat[0];
      render(item, flat, ep, flat.indexOf(ep));
    });

    initFullscreenControls();
  }

  /* =========================================================
     Bug #2 fix: full, cross-browser fullscreen support.
     - Standard Fullscreen API with webkit/moz/ms fallbacks
     - iOS Safari fallback to video.webkitEnterFullscreen()
       (iOS only allows native fullscreen on the <video> element
       itself, not on arbitrary wrapper elements)
     - Fullscreen button + double-click toggle
     - Escape-to-exit is native browser behavior for the
       Fullscreen API, so no extra key handling is required
     - Best-effort landscape orientation lock on phones that
       support the Screen Orientation API while in fullscreen
     ========================================================= */
  function initFullscreenControls() {
    const wrap = document.getElementById("w-player-wrap");
    const video = document.getElementById("w-video");
    const btn = document.getElementById("w-fullscreen-btn");
    const icon = document.getElementById("w-fullscreen-icon");
    if (!wrap || !video || !btn || !icon || wrap.dataset.fsBound) return;
    wrap.dataset.fsBound = "1"; // guard against double-binding if this ever runs twice

    const EXPAND_PATH = "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3";
    const COMPRESS_PATH = "M9 3v3a2 2 0 01-2 2H4m16 0h-3a2 2 0 01-2-2V3M4 15h3a2 2 0 012 2v3m8-5h3M15 21v-3a2 2 0 012-2h3";

    function fsElement() {
      return document.fullscreenElement || document.webkitFullscreenElement ||
        document.mozFullScreenElement || document.msFullscreenElement || null;
    }
    function isFs() { return !!fsElement() || video.webkitDisplayingFullscreen; }

    function requestFs(el) {
      if (!el) return null;
      if (el.requestFullscreen) return el.requestFullscreen();
      if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
      if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
      if (el.msRequestFullscreen) return el.msRequestFullscreen();
      return null;
    }
    function exitFs() {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
      if (document.msExitFullscreen) return document.msExitFullscreen();
      if (video.webkitExitFullscreen) return video.webkitExitFullscreen();
      return null;
    }

    function tryLockLandscape() {
      try {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => { /* not supported / not allowed — safe to ignore */ });
        }
      } catch (e) { /* Screen Orientation API not available on this browser */ }
    }
    function tryUnlockOrientation() {
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); }
      catch (e) { /* ignore */ }
    }

    function fallbackVideoFullscreen() {
      // iOS Safari path: only the <video> element itself supports native fullscreen.
      if (typeof video.webkitEnterFullscreen === "function") { video.webkitEnterFullscreen(); return; }
      requestFs(video);
    }

    function enterFullscreen() {
      const result = requestFs(wrap);
      if (result && typeof result.then === "function") {
        result.then(tryLockLandscape).catch(fallbackVideoFullscreen);
      } else if (result === null) {
        fallbackVideoFullscreen();
      } else {
        tryLockLandscape();
      }
    }

    function toggleFullscreen() {
      if (isFs()) { exitFs(); } else { enterFullscreen(); }
    }

    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });
    // Whole-video dblclick→fullscreen removed: js/custom-controls.js now
    // handles dblclick with left/center/right zones (rewind/fullscreen/
    // forward) and calls AnimeHub.playerFullscreen.toggle() below for the
    // center zone, so this stays the single source of truth for the actual
    // fullscreen mechanics.

    function syncIcon() {
      const active = isFs();
      const path = icon.querySelector("path");
      if (path) path.setAttribute("d", active ? COMPRESS_PATH : EXPAND_PATH);
      btn.setAttribute("aria-label", active ? "Exit fullscreen" : "Enter fullscreen");
      btn.title = active ? "Exit Fullscreen" : "Fullscreen";
      if (!active) tryUnlockOrientation();
    }
    ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"]
      .forEach((evt) => document.addEventListener(evt, syncIcon));
    video.addEventListener("webkitendfullscreen", syncIcon); // iOS Safari's own fullscreen exit event

    // Exposed so js/player-extras.js can drive fullscreen from the "F" keyboard shortcut.
    AnimeHub.playerFullscreen = { toggle: toggleFullscreen, isFullscreen: isFs };
  }

  /* ---------- Player: Backblaze B2 direct HTML5 player, or a YouTube thumbnail card (no embed — hands off to YouTube in the same tab), watchLink fallback ---------- */
  function loadPlayer(item, ep, neighbors) {
    neighbors = neighbors || {};
    const stateBox = document.getElementById("w-player-state");
    const video = document.getElementById("w-video");
    const ytCard = document.getElementById("w-youtube-card");
    const fallback = document.getElementById("w-fallback");
    const fallbackText = document.getElementById("w-fallback-text");
    const fallbackActions = document.getElementById("w-fallback-actions");
    const fsBtn = document.getElementById("w-fullscreen-btn");

    // Reset UI for this episode — identical Backblaze reset as before, plus
    // clearing any previous YouTube thumbnail card.
    video.pause();
    video.innerHTML = "";
    video.removeAttribute("src");
    video.removeAttribute("poster");
    video.load();
    video.style.display = "none";
    video.onerror = null;
    if (ytCard) { ytCard.innerHTML = ""; ytCard.onclick = null; ytCard.style.display = "none"; }
    fallback.style.display = "none";
    fallbackActions.innerHTML = "";
    stateBox.style.display = "none";
    if (fsBtn) fsBtn.style.display = "none";

    function showFallback(message) {
      video.style.display = "none";
      if (ytCard) { ytCard.innerHTML = ""; ytCard.onclick = null; ytCard.style.display = "none"; }
      stateBox.style.display = "none";
      fallback.style.display = "flex";
      fallbackText.textContent = message;
      fallbackActions.innerHTML = (ep.watchLink && ep.watchLink.trim())
        ? `<a class="btn btn-ghost" href="${ep.watchLink}" target="_blank" rel="noopener noreferrer"><span>Open Watch Link</span></a>`
        : "";
      if (fsBtn) fsBtn.style.display = "none";
    }

    const stream = resolveStream(ep);
    let hasVideo = false;
    let youtubeMode = false;

    if (stream.source === "backblaze") {
      // ----- Backblaze path: byte-for-byte the same as before ----- //
      const posterSrc = ep.thumbnail || item.banner || "";
      if (posterSrc) video.setAttribute("poster", posterSrc);
      video.innerHTML = `<source src="${stream.videoUrl}">`;
      video.style.display = "block";
      if (fsBtn) fsBtn.style.display = "flex";
      // If the B2 URL is broken/unreachable, fall back to the watchLink
      // instead of leaving a dead player on screen.
      video.onerror = () => showFallback("This episode's video couldn't be loaded. Try the watch link instead.");
      // Netflix/YouTube/Crunchyroll-style behavior: load paused, showing the
      // poster + the browser's native centered play button. No autoplay on a
      // manually-opened episode — video.load() only buffers metadata.
      video.load();
      hasVideo = true;
      // Exception: auto-advancing from the previous episode's countdown (or
      // its "Play Now" button) DOES autoplay, same as Netflix/Crunchyroll.
      if (neighbors.autoplay) video.play().catch(() => { /* autoplay may be blocked — user can press play */ });
    } else if (stream.source === "youtube" && stream.videoId && ytCard) {
      // ----- YouTube path: no embed at all. Show the episode thumbnail like
      // a paused player, with a centered Play button that hands off to
      // YouTube itself in the same tab. ----- //
      youtubeMode = true;
      const posterSrc = ep.thumbnail || item.banner || "";
      const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(stream.videoId)}`;
      ytCard.innerHTML = `
        <img class="yt-card-thumb" src="${posterSrc}" alt="">
        <div class="yt-card-overlay"></div>
        <button type="button" class="yt-card-play-btn" aria-label="Watch on YouTube">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <span class="yt-card-label">Watch on YouTube</span>`;
      ytCard.style.display = "flex";
      // Whole card is clickable — thumbnail, overlay, button, and label all
      // hand off the same way. Same tab, per spec.
      ytCard.onclick = () => { window.location.href = youtubeUrl; };
      // hasVideo stays false: Continue Watching / resume-prompt are
      // Backblaze-only OTT features and never apply to YouTube.
    } else {
      showFallback(ep.watchLink ? "Streaming isn't available for this episode yet — use the link below." : "No stream source has been configured for this episode yet.");
    }

    // Skip Intro/Outro, Auto Next Episode, Continue Watching progress, Resume
    // prompt, keyboard shortcuts, PiP, Theater mode, playback speed, and the
    // cinematic backdrop are all handled by js/player-extras.js so this file
    // keeps owning only data/routing/streaming, as before. youtubeMode tells
    // it to keep the Dynamic Background but suppress every Backblaze-only
    // OTT control, since YouTube episodes are a click-through thumbnail
    // card, not a playable in-page video.
    if (AnimeHub.playerExtras && AnimeHub.playerExtras.applyEpisode) {
      AnimeHub.playerExtras.applyEpisode({
        item, ep, hasVideo, youtubeMode,
        prevEp: neighbors.prevEp, nextEp: neighbors.nextEp,
        goNext: neighbors.goNext, goPrev: neighbors.goPrev,
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initWatchPage);
})();