/* =========================================================
   ANIMEHUB · download.js
   Powers download.html. Reads ?id=&season=&episode= from the
   URL, resolves the matching title/episode through the shared
   AnimeHub.data cache (anime-loader.js), and renders large
   thumbnail + episode info + three quality download cards.
   Reuses AnimeHub.data.getById and AnimeHub.render.escapeHtml —
   no new data-loading or escaping logic.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function downloadIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 21h16"/></svg>';
  }

  /* Resolve the requested episode. Movies behave as a single
     season-1/episode-1 entry, mirroring how script.js already
     treats movies in the Watch/Download button rendering. */
  function resolveEpisode(item, seasonNum, episodeNum) {
    if (!item) return null;
    if (item.category === "movie") {
      return {
        title: item.title,
        episodeNumber: 1,
        seasonNumber: 1,
        thumbnail: item.detailBanner || item.banner,
        duration: item.duration,
        downloadLinks: item.downloadLinks || {},
      };
    }
    const season = (item.seasons || []).find((s) => String(s.seasonNumber) === String(seasonNum));
    if (!season) return null;
    const ep = (season.episodes || []).find((e) => String(e.episodeNumber) === String(episodeNum));
    if (!ep) return null;
    return {
      title: ep.title,
      episodeNumber: ep.episodeNumber,
      seasonNumber: season.seasonNumber,
      thumbnail: ep.thumbnail,
      duration: ep.duration,
      downloadLinks: ep.downloadLinks || {},
    };
  }

  function qualityCardHtml(label, link) {
    const hasLink = link && link.trim();
    if (hasLink) {
      return `<a class="dl-quality-card" href="${link}" target="_blank" rel="noopener noreferrer">
        ${downloadIcon()}
        <span class="dl-quality-label">${label}</span>
        <span class="dl-quality-status">Tap to download</span>
      </a>`;
    }
    return `<button class="dl-quality-card is-disabled" disabled>
      ${downloadIcon()}
      <span class="dl-quality-label">${label}</span>
      <span class="dl-quality-status">Coming Soon</span>
    </button>`;
  }

  function renderNotFound(card) {
    card.innerHTML = `
      <div class="state-block">
        <div class="state-icon">📥</div>
        <h3>Download link not found</h3>
        <p>This download link looks incorrect or the episode is no longer available.</p>
        <a href="index.html" class="btn btn-glow">Back to Anime NeuriX</a>
      </div>`;
  }

  function renderDownloadPage() {
    const card = document.getElementById("download-card");
    if (!card) return;

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const seasonParam = params.get("season") || "1";
    const episodeParam = params.get("episode") || "1";

    const item = AnimeHub.data.getById(id);
    const ep = resolveEpisode(item, seasonParam, episodeParam);

    if (!item || !ep) { renderNotFound(card); return; }

    const escapeHtml = AnimeHub.render.escapeHtml;
    document.title = ep.title + " · Download · Anime NeuriX";

    const links = ep.downloadLinks || {};
    card.innerHTML = `
      <img class="dl-thumb" src="${ep.thumbnail}" alt="${escapeHtml(ep.title)}">
      <div class="dl-info">
        <div class="genre-eyebrow">${escapeHtml(item.title)}</div>
        <h1 class="details-title" id="dl-ep-title">${escapeHtml(ep.title)}</h1>
        <div class="details-meta-row">
          <span class="pill">Season ${ep.seasonNumber}</span>
          <span class="pill">Episode ${ep.episodeNumber}</span>
          ${ep.duration ? `<span class="pill">${escapeHtml(ep.duration)}</span>` : ""}
        </div>
      </div>
      <div class="dl-quality-grid">
        ${qualityCardHtml("480p", links["480p"])}
        ${qualityCardHtml("720p", links["720p"])}
        ${qualityCardHtml("1080p", links["1080p"])}
      </div>`;
  }

  document.addEventListener("animehub:data-ready", renderDownloadPage);
})();