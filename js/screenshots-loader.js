/* =========================================================
   ANIMEHUB · screenshots-loader.js
   Populates screenshots.html from ?id=... — the full gallery
   that used to live inline on anime-details.html (Problem #11).
   Reuses AnimeHub.data, no new data structures.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function qs(name) { return new URLSearchParams(location.search).get(name); }

  function init() {
    const gallery = document.getElementById("shots-gallery");
    if (!gallery) return; // not on this page

    AnimeHub.data.fetchData().then(() => {
      const id = qs("id");
      const item = id ? AnimeHub.data.getById(id) : null;
      const emptyState = document.getElementById("shots-empty-state");
      const titleEl = document.getElementById("shots-anime-title");

      if (!item) {
        titleEl.textContent = "Screenshots";
        gallery.innerHTML = "";
        emptyState.style.display = "block";
        return;
      }

      document.title = `${item.title} Screenshots · Anime NeuriX`;
      titleEl.textContent = item.title;

      const shots = item.screenshots || [];
      if (!shots.length) {
        gallery.innerHTML = "";
        emptyState.style.display = "block";
        return;
      }
      emptyState.style.display = "none";
      gallery.innerHTML = shots.map((src, i) => `
        <div class="shots-item">
          <img src="${src}" alt="${AnimeHub.render.escapeHtml(item.title)} screenshot ${i + 1}" loading="lazy">
        </div>`).join("");

      const backBtn = document.getElementById("shots-back-btn");
      backBtn.onclick = () => {
        if (document.referrer && document.referrer.indexOf(location.host) !== -1 && history.length > 1) {
          history.back();
        } else {
          location.href = `anime-details.html?id=${encodeURIComponent(item.id)}`;
        }
      };
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();