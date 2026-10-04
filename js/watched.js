/* =========================================================
   ANIMEHUB · watched.js
   "Mark as Watched" state for individual episodes, plus the
   data layer behind the dedicated Watched Episodes page.
   Mirrors the existing watchlist.js/favorites.js pattern:
   plain localStorage, no backend, fires a CustomEvent so any
   open page (episode list, watch page, watched.html) can
   repaint itself when the state changes.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const KEY = "animehub:watched";

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeAll(map) {
    localStorage.setItem(KEY, JSON.stringify(map));
    document.dispatchEvent(new CustomEvent("animehub:watched-changed"));
  }
  function epKey(animeId, season, episode) { return `${animeId}:${season}:${episode}`; }

  function has(animeId, season, episode) { return !!readAll()[epKey(animeId, season, episode)]; }

  function mark(animeId, season, episode) {
    const all = readAll();
    all[epKey(animeId, season, episode)] = { animeId, season: Number(season), episode: Number(episode), ts: Date.now() };
    writeAll(all);
  }
  function unmark(animeId, season, episode) {
    const all = readAll();
    delete all[epKey(animeId, season, episode)];
    writeAll(all);
  }
  function toggle(animeId, season, episode) {
    const on = has(animeId, season, episode);
    on ? unmark(animeId, season, episode) : mark(animeId, season, episode);
    return !on;
  }

  /* Grouped for the Watched Episodes page: { animeId: { title, seasons: { seasonNumber: [episodeNumbers] } } } */
  function getGrouped() {
    const all = readAll();
    const groups = {};
    Object.values(all).forEach((entry) => {
      const item = AnimeHub.data ? AnimeHub.data.getById(entry.animeId) : null;
      if (!groups[entry.animeId]) groups[entry.animeId] = { id: entry.animeId, title: item ? item.title : entry.animeId, poster: item ? item.poster : "", seasons: {} };
      const g = groups[entry.animeId];
      if (!g.seasons[entry.season]) g.seasons[entry.season] = [];
      g.seasons[entry.season].push(entry.episode);
    });
    Object.values(groups).forEach((g) => {
      Object.values(g.seasons).forEach((eps) => eps.sort((a, b) => a - b));
    });
    return Object.values(groups).sort((a, b) => a.title.localeCompare(b.title));
  }

  function count() { return Object.keys(readAll()).length; }

  /* ---------- watched.html page wiring ---------- */
  function initWatchedPage() {
    const root = document.getElementById("watched-groups");
    if (!root) return; // not on this page

    function draw() {
      AnimeHub.data.fetchData().then(() => {
        const groups = getGrouped();
        const emptyState = document.getElementById("watched-empty-state");
        const countLabel = document.getElementById("watched-count-label");
        const total = count();
        if (countLabel) countLabel.textContent = total + (total === 1 ? " episode" : " episodes");

        if (!groups.length) {
          root.innerHTML = "";
          if (emptyState) emptyState.style.display = "block";
          return;
        }
        if (emptyState) emptyState.style.display = "none";

        root.innerHTML = groups.map((g) => `
          <div class="watched-anime-group">
            <a class="watched-anime-head" href="anime-details.html?id=${encodeURIComponent(g.id)}">
              <img src="${g.poster || ""}" alt="" class="watched-anime-thumb">
              <span class="watched-anime-title">${AnimeHub.render ? AnimeHub.render.escapeHtml(g.title) : g.title}</span>
            </a>
            ${Object.keys(g.seasons).sort((a, b) => a - b).map((sn) => `
              <div class="watched-season-block">
                <div class="watched-season-label">Season ${sn}</div>
                <div class="watched-ep-chip-row">
                  ${g.seasons[sn].map((ep) => `
                    <button type="button" class="watched-ep-chip js-unmark-watched" data-anime-id="${g.id}" data-season="${sn}" data-episode="${ep}">
                      <span>✓ Episode ${ep}</span>
                      <span class="watched-ep-chip-x" aria-hidden="true">×</span>
                    </button>`).join("")}
                </div>
              </div>`).join("")}
          </div>`).join("");
      });
    }

    root.addEventListener("click", (e) => {
      const chip = e.target.closest(".js-unmark-watched");
      if (!chip) return;
      const { animeId, season, episode } = chip.dataset;
      unmark(animeId, season, episode);
    });

    document.addEventListener("animehub:watched-changed", draw);
    draw();
  }
  document.addEventListener("DOMContentLoaded", initWatchedPage);

  AnimeHub.watched = { has, mark, unmark, toggle, getGrouped, count };
})();