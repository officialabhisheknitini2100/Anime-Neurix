/* =========================================================
   ANIMEHUB · watchlist.js
   localStorage-backed watchlist + watchlist.html page logic
   ========================================================= */
(function () {
  "use strict";
  const KEY = "animehub:watchlist";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function readIds() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function writeIds(ids) {
    localStorage.setItem(KEY, JSON.stringify(ids));
    document.dispatchEvent(new CustomEvent("animehub:watchlist-changed", { detail: { ids } }));
  }
  function has(id) { return readIds().includes(id); }
  function add(id) { const ids = readIds(); if (!ids.includes(id)) { ids.push(id); writeIds(ids); } }
  function remove(id) { writeIds(readIds().filter((x) => x !== id)); }
  function toggle(id) {
    const on = has(id);
    on ? remove(id) : add(id);
    return !on;
  }
  function count() { return readIds().length; }
  function getItems() {
    const data = AnimeHub.data;
    if (!data) return [];
    return readIds().map((id) => data.getById(id)).filter(Boolean);
  }

  AnimeHub.watchlist = { has, add, remove, toggle, count, getItems, readIds };

  /* ---------- watchlist.html page wiring ---------- */
  function initWatchlistPage() {
    const grid = document.getElementById("watchlist-grid");
    if (!grid) return; // not on this page

    const searchInput = document.getElementById("wl-search");
    const sortSelect = document.getElementById("wl-sort");
    const countLabel = document.getElementById("wl-count-label");
    const emptyState = document.getElementById("wl-empty-state");

    function draw() {
      let items = getItems();
      countLabel && (countLabel.textContent = items.length + (items.length === 1 ? " title" : " titles"));

      const q = (searchInput && searchInput.value || "").trim().toLowerCase();
      if (q) items = items.filter((i) => i.title.toLowerCase().includes(q));

      const sortKey = sortSelect ? sortSelect.value : "az";
      items = AnimeHub.data.sortList(items, sortKey);

      if (!items.length) {
        grid.innerHTML = "";
        emptyState && (emptyState.style.display = "block");
        return;
      }
      emptyState && (emptyState.style.display = "none");
      grid.innerHTML = items.map(AnimeHub.render.renderCard).join("");
      AnimeHub.ui && AnimeHub.ui.observeReveal && AnimeHub.ui.observeReveal();
    }

    searchInput && searchInput.addEventListener("input", draw);
    sortSelect && sortSelect.addEventListener("change", draw);
    document.addEventListener("animehub:watchlist-changed", draw);
    AnimeHub.data.fetchData().then(draw);
  }

  document.addEventListener("DOMContentLoaded", initWatchlistPage);
})();
