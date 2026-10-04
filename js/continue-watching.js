/* =========================================================
   ANIMEHUB · continue-watching.js
   Progress is now driven by real playback telemetry from the
   Watch Page (see js/player-extras.js), which calls
   recordProgress() every few seconds with the video's actual
   currentTime/duration. record() is still used the moment an
   episode link/thumbnail is clicked (from the homepage, details
   page, or watch page's own episode list) so the entry appears
   immediately — real progress from recordProgress() then keeps
   it accurate as the user actually watches.
   ========================================================= */
(function () {
  "use strict";
  const KEY = "animehub:continue-watching";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeAll(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
    document.dispatchEvent(new CustomEvent("animehub:cw-changed"));
  }

  function record(animeId, season, episode, thumbnail) {
    const map = readAll();
    const existing = map[animeId];
    if (existing && String(existing.season) === String(season) && String(existing.episode) === String(episode)) {
      // Re-opening the same episode — keep its real progress, just bump recency.
      existing.lastWatched = Date.now();
      if (thumbnail) existing.thumbnail = thumbnail;
      map[animeId] = existing;
    } else {
      // A different episode (or a brand new title) — start fresh. Real
      // percent/time now comes from actual playback via recordProgress().
      map[animeId] = {
        season, episode, percent: 0, time: 0, duration: 0,
        thumbnail: thumbnail || "", lastWatched: Date.now(), completed: false,
      };
    }
    writeAll(map);
  }

  /* Real progress, called from the video's timeupdate/pause/ended handlers.
     currentTime/duration are the actual <video> values in seconds. */
  function recordProgress(animeId, season, episode, currentTime, duration, thumbnail) {
    if (!animeId || !duration || !isFinite(duration) || duration <= 0) return;
    const percent = Math.max(0, Math.min(100, (currentTime / duration) * 100));
    if (percent >= 95) {
      // Watched to (near) completion — drop it from Continue Watching,
      // same as Netflix/Crunchyroll do once an episode is finished.
      remove(animeId);
      return;
    }
    const map = readAll();
    const existingThumb = map[animeId] && map[animeId].thumbnail;
    map[animeId] = {
      season, episode, percent,
      time: currentTime, duration,
      thumbnail: thumbnail || existingThumb || "",
      lastWatched: Date.now(),
      completed: false,
    };
    writeAll(map);
  }

  function setPercent(animeId, percent) {
    const map = readAll();
    if (map[animeId]) { map[animeId].percent = Math.max(0, Math.min(100, percent)); writeAll(map); }
  }

  function remove(animeId) {
    const map = readAll();
    delete map[animeId];
    writeAll(map);
  }

  function getEntry(animeId) { return readAll()[animeId] || null; }

  function getAllSorted() {
    const map = readAll();
    return Object.entries(map)
      .map(([animeId, cw]) => ({ animeId, ...cw }))
      .sort((a, b) => b.lastWatched - a.lastWatched);
  }

  AnimeHub.continueWatching = { record, recordProgress, setPercent, remove, getEntry, getAllSorted };

  /* ---------- homepage row renderer ---------- */
  function renderRow() {
    const row = document.getElementById("row-continue-watching");
    const section = document.getElementById("section-continue-watching");
    if (!row) return;
    const entries = getAllSorted();
    if (!entries.length) { section && (section.style.display = "none"); return; }
    section && (section.style.display = "");
    const data = AnimeHub.data;
    row.innerHTML = entries
      .map((cw) => {
        const item = data.getById(cw.animeId);
        return item ? AnimeHub.render.renderCwCard(cw, item) : "";
      })
      .join("");
    AnimeHub.ui && AnimeHub.ui.observeReveal && AnimeHub.ui.observeReveal();
  }

  document.addEventListener("animehub:cw-changed", renderRow);
  document.addEventListener("animehub:data-ready", renderRow);

  /* Wire up any element with data-watch-link / data-anime-id / data-season / data-episode */
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-track-episode]");
    if (!link) return;
    const { animeId, season, episode, thumb } = link.dataset;
    if (animeId) record(animeId, Number(season || 1), Number(episode || 1), thumb || "");
  });
})();