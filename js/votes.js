/* =========================================================
   ANIMEHUB · votes.js
   Like / Dislike for episodes (and movies, keyed the same way).
   There's no backend in this project, so a stable "base" count
   is derived deterministically from the episode's own id (so it
   looks like a real, populated app instead of starting at 0),
   and the visitor's own vote is layered on top of that and kept
   in localStorage — mutually exclusive (picking Dislike removes
   an existing Like and vice versa), toggle-off supported.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const KEY = "animehub:votes";

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeAll(map) { localStorage.setItem(KEY, JSON.stringify(map)); }

  function epKey(animeId, season, episode) { return `${animeId}:${season}:${episode}`; }

  /* Deterministic pseudo-base count so numbers feel populated and stay
     stable across reloads without needing a backend or new JSON fields. */
  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }
  function baseCounts(key) {
    const h = hash(key);
    return { like: 1200 + (h % 42000), dislike: 20 + (h % 1400) };
  }

  function getState(animeId, season, episode) {
    const key = epKey(animeId, season, episode);
    const all = readAll();
    const vote = all[key] || null; // "like" | "dislike" | null
    const base = baseCounts(key);
    return {
      vote,
      like: base.like + (vote === "like" ? 1 : 0),
      dislike: base.dislike + (vote === "dislike" ? 1 : 0),
    };
  }

  function setVote(animeId, season, episode, vote) {
    const key = epKey(animeId, season, episode);
    const all = readAll();
    const current = all[key] || null;
    const next = current === vote ? null : vote; // clicking the active vote again clears it
    if (next) all[key] = next; else delete all[key];
    writeAll(all);
    document.dispatchEvent(new CustomEvent("animehub:vote-changed", { detail: { animeId, season, episode, vote: next } }));
    return getState(animeId, season, episode);
  }

  AnimeHub.votes = { getState, setVote };
})();