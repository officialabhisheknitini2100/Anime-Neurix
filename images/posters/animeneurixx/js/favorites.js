/* =========================================================
   ANIMEHUB · favorites.js
   localStorage-backed favorites + favorites.html page logic
   ========================================================= */
(function () {
  "use strict";
  const KEY = "animehub:favorites";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function readIds() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function writeIds(ids) {
    localStorage.setItem(KEY, JSON.stringify(ids));
    document.dispatchEvent(new CustomEvent("animehub:favorites-changed", { detail: { ids } }));
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
  function topGenres(limit) {
    const tally = {};
    getItems().forEach((item) => (item.genres || []).forEach((g) => (tally[g] = (tally[g] || 0) + 1)));
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, limit || 5).map((e) => e[0]);
  }

  AnimeHub.favorites = { has, add, remove, toggle, count, getItems, topGenres, readIds };

  function refreshBadges() {
    document.querySelectorAll(".js-fav-count").forEach((el) => (el.textContent = count()));
  }
  document.addEventListener("animehub:favorites-changed", refreshBadges);
  document.addEventListener("DOMContentLoaded", refreshBadges);

  /* ---------- favorites.html page wiring ---------- */
  function initFavoritesPage() {
    const grid = document.getElementById("favorites-grid");
    if (!grid) return;

    const counterEl = document.getElementById("fav-counter");
    const emptyState = document.getElementById("fav-empty-state");

    function draw() {
      const items = getItems();
      counterEl && (counterEl.textContent = items.length);
      if (!items.length) {
        grid.innerHTML = "";
        emptyState && (emptyState.style.display = "block");
        return;
      }
      emptyState && (emptyState.style.display = "none");
      grid.innerHTML = items.map(AnimeHub.render.renderCard).join("");
      AnimeHub.ui && AnimeHub.ui.observeReveal && AnimeHub.ui.observeReveal();
    }

    document.addEventListener("animehub:favorites-changed", draw);
    AnimeHub.data.fetchData().then(draw);
  }

  document.addEventListener("DOMContentLoaded", initFavoritesPage);
})();
