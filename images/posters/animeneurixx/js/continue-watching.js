/* =========================================================
   ANIMEHUB · continue-watching.js
   AnimeHub has no embedded video player by design (episodes
   redirect out to wherever the admin has rights to host them).
   So "watch progress" can't come from real playback telemetry.
   Instead we simulate a believable resume point: each time an
   episode is opened it nudges that title's progress forward,
   the same way a real OTT app would after you come back to it.
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
    let percent;
    if (existing && existing.season === season && existing.episode === episode) {
      percent = Math.min(96, (existing.percent || 10) + 22); // resuming the same episode
    } else {
      percent = 14; // freshly opened a (new) episode
    }
    map[animeId] = { season, episode, percent, thumbnail, lastWatched: Date.now() };
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

  AnimeHub.continueWatching = { record, setPercent, remove, getEntry, getAllSorted };

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
