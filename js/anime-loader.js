/* =========================================================
   ANIMEHUB · anime-loader.js
   Single source of truth for catalog data.
   Every other script reads through window.AnimeHub.data
   ========================================================= */
(function () {
  "use strict";

  const DATA_URL = "data/anime-data.json";

  const AnimeHub = window.AnimeHub || {};
  window.AnimeHub = AnimeHub;

  let cache = null;
  let readyPromise = null;

  function fetchData() {
    if (readyPromise) return readyPromise;
    readyPromise = fetch(DATA_URL)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load anime-data.json (" + res.status + ")");
        return res.json();
      })
      .then((json) => {
        cache = json;
        return json;
      })
      .catch((err) => {
        console.error("[AnimeHub] data load error:", err);
        cache = { genres: [], studios: [], anime: [], socialLinks: {}, siteInfo: { name: "Anime NeuriX" } };
        return cache;
      });
    return readyPromise;
  }

  /* ---------- basic getters ---------- */
  function getAll() { return (cache && cache.anime) || []; }
  function getAnimeOnly() { return getAll().filter((a) => a.category === "anime"); }
  function getMoviesOnly() { return getAll().filter((a) => a.category === "movie"); }
  function getById(id) { return getAll().find((a) => a.id === id); }
  function getGenres() { return (cache && cache.genres) || []; }
  function getStudios() { return (cache && cache.studios) || []; }
  function getSocialLinks() { return (cache && cache.socialLinks) || {}; }
  function getSiteInfo() { return (cache && cache.siteInfo) || { name: "Anime NeuriX", tagline: "" }; }
  function getGenreMeta() { return (cache && cache.genreMeta) || {}; }
  function getNews() { return (cache && cache.news) || []; }

  function getGenreInfo(genre) {
    const meta = getGenreMeta()[genre];
    return meta || { tagline: "", icon: "🎬", themePrimary: "#8b2af0", themeSecondary: "#0d0a1b", themeAccent: "#b21bc5" };
  }

  /* Resolve the color theme for an anime/movie details page:
     1) explicit per-title "theme" field on the item, else
     2) genreMeta entry for the item's first genre, else
     3) the site default palette (no override). */
  function resolveTheme(item) {
    if (!item) return null;
    if (item.theme) return item.theme;
    const primaryGenre = (item.genres || [])[0];
    if (primaryGenre) {
      const meta = getGenreMeta()[primaryGenre];
      if (meta) return { name: primaryGenre, themePrimary: meta.themePrimary, themeSecondary: meta.themeSecondary, themeAccent: meta.themeAccent };
    }
    return null;
  }

  function getByGenre(genre) {
    return getAll().filter((a) => (a.genres || []).some((g) => g.toLowerCase() === genre.toLowerCase()));
  }

  /* ---------- scoring ---------- */
  function trendingScore(item) {
    const ratingPart = (item.rating || 0) * 8;
    const popPart = (item.popularity || 0) * 1.4;
    const favPart = Math.log10((item.favoritesCount || 1) + 1) * 12;
    const viewPart = Math.log10((item.views || 1) + 1) * 14;
    return ratingPart + popPart + favPart + viewPart;
  }

  /* ---------- sort ---------- */
  function sortList(list, key) {
    const arr = list.slice();
    switch (key) {
      case "rating": return arr.sort((a, b) => b.rating - a.rating);
      case "rating-asc": return arr.sort((a, b) => a.rating - b.rating);
      case "year": return arr.sort((a, b) => b.releaseYear - a.releaseYear);
      case "year-asc": return arr.sort((a, b) => a.releaseYear - b.releaseYear);
      case "az": return arr.sort((a, b) => a.title.localeCompare(b.title));
      case "za": return arr.sort((a, b) => b.title.localeCompare(a.title));
      case "popularity": return arr.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      case "trending": return arr.sort((a, b) => trendingScore(b) - trendingScore(a));
      default: return arr;
    }
  }

  /* ---------- filter ---------- */
  function filterList(list, filters) {
    if (!filters) return list;
    let arr = list;
    if (filters.genres && filters.genres.length) {
      arr = arr.filter((a) => filters.genres.every((g) => (a.genres || []).includes(g)));
    }
    if (filters.studios && filters.studios.length) {
      arr = arr.filter((a) => filters.studios.includes(a.studio));
    }
    if (filters.status && filters.status.length) {
      arr = arr.filter((a) => filters.status.includes(a.status));
    }
    if (filters.category && filters.category.length) {
      arr = arr.filter((a) => filters.category.includes(a.category));
    }
    if (filters.minRating) {
      arr = arr.filter((a) => a.rating >= filters.minRating);
    }
    if (filters.year) {
      arr = arr.filter((a) => String(a.releaseYear) === String(filters.year));
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      arr = arr.filter((a) => a.title.toLowerCase().includes(q));
    }
    return arr;
  }

  function paginate(list, page, perPage) {
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * perPage;
    return { items: list.slice(start, start + perPage), page: safePage, totalPages, total: list.length };
  }

  /* ---------- homepage row queries ---------- */
  const Rows = {
    trendingAnime: (n) => sortList(getAnimeOnly(), "trending").slice(0, n),
    topRatedAnime: (n) => sortList(getAnimeOnly(), "rating").slice(0, n),
    popularSeries: (n) => sortList(getAnimeOnly(), "popularity").slice(0, n),
    latestEpisodes: (n) => sortList(getAnimeOnly().filter((a) => a.status === "Ongoing"), "year").slice(0, n),
    topRatedMovies: (n) => sortList(getMoviesOnly(), "rating").slice(0, n),
    mostWatchedMovies: (n) => sortList(getMoviesOnly(), "popularity")
      .slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, n),
    popularMovies: (n) => sortList(getMoviesOnly(), "popularity").slice(0, n),
    latestMovies: (n) => sortList(getMoviesOnly(), "year").slice(0, n),
    trendingWorldwide: (n) => sortList(getAll(), "trending").slice(0, n),
    highestRated: (n) => sortList(getAll(), "rating").slice(0, n),
    risingAnime: (n) => getAnimeOnly().filter((a) => a.releaseYear >= 2021)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, n),
    mostFavorited: (n) => getAll().slice().sort((a, b) => (b.favoritesCount || 0) - (a.favoritesCount || 0)).slice(0, n),
    editorsChoice: (n) => getAll().filter((a) => a.editorsPick).slice(0, n),
  };

  /* ---------- card / row rendering ---------- */
  function starIcon() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1.9 9.5l7.1-.6L12 2z"/></svg>';
  }
  function plusIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
  }
  function checkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
  }
  function heartIcon() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 7.9 2.3 4 6.1 4 8.4 4 10.3 5.4 12 7.5 13.7 5.4 15.6 4 17.9 4c3.8 0 5.7 3.9 4.1 7.7C19.5 16.4 12 21 12 21z"/></svg>';
  }

  function renderCard(item) {
    const isFav = AnimeHub.favorites && AnimeHub.favorites.has(item.id);
    const isWl = AnimeHub.watchlist && AnimeHub.watchlist.has(item.id);
    const tag = item.category === "movie" ? "MOVIE" : "SERIES";
    return `
      <article class="anime-card" data-id="${item.id}">
        <a href="anime-details.html?id=${item.id}" class="poster-wrap mt-overlay-link" aria-label="View ${escapeHtml(item.title)}">
          <img src="${item.poster}" alt="${escapeHtml(item.title)} poster" loading="lazy">
          <span class="poster-shade"></span>
        </a>
        <span class="card-rating">${starIcon()} ${item.rating.toFixed(1)}</span>
        <span class="card-type-tag">${tag}</span>
        <div class="card-quick-actions">
          <button class="card-action-btn js-fav-btn ${isFav ? "is-active" : ""}" data-id="${item.id}" aria-label="Toggle favorite" title="Favorite">${heartIcon()}</button>
          <button class="card-action-btn js-wl-btn ${isWl ? "is-active" : ""}" data-id="${item.id}" aria-label="Toggle watchlist" title="Watchlist">${isWl ? checkIcon() : plusIcon()}</button>
        </div>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-meta">
            <span>${item.releaseYear}</span>
            <span>${(item.genres || [])[0] || ""}</span>
            <span>${item.category === "movie" ? (item.duration || "") : item.episodeCount + " EP"}</span>
          </div>
        </div>
      </article>`;
  }

  function renderCwCard(cw, item) {
    const pct = Math.min(100, Math.round(cw.percent || 0));
    return `
      <article class="anime-card cw-card" data-id="${item.id}">
        <a href="anime-details.html?id=${item.id}" class="poster-wrap mt-overlay-link" aria-label="Continue ${escapeHtml(item.title)}">
          <img src="${cw.thumbnail || item.banner}" alt="${escapeHtml(item.title)}" loading="lazy">
          <span class="poster-shade"></span>
          <div class="card-progress"><i style="width:${pct}%"></i></div>
        </a>
        <div class="card-body">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="card-meta"><span>Season ${cw.season} · Episode ${cw.episode}</span></div>
          <div class="cw-progress-label">${pct}% watched</div>
        </div>
      </article>`;
  }

  function renderSkeletonCards(n) {
    let html = "";
    for (let i = 0; i < n; i++) {
      html += `<div class="skeleton-card">
        <div class="skeleton-block poster"></div>
        <div style="padding:0 0 2px;">
          <div class="skeleton-block line"></div>
          <div class="skeleton-block line short"></div>
          <div class="skeleton-extra"></div>
        </div>
      </div>`;
    }
    return html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------- shared video-source utilities ----------
     Moved here (from watch-loader.js) so any page can detect/parse a
     YouTube URL without loading the full episode-player system — used by
     both the Watch page and the Problem #5 trailer player. */
  function extractYoutubeId(raw) {
    const val = (raw || "").trim();
    if (!val) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(val)) return val; // already a bare video ID
    try {
      const u = new URL(val);
      if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    } catch (e) { /* not a full URL — fall through */ }
    return val;
  }
  function isDirectVideoUrl(raw) {
    return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test((raw || "").trim());
  }
  /* Best-effort source classifier for a plain URL string (no explicit
     "source" field) — used by the trailer player, which only gets one
     free-text field to work with. Watch-loader.js's episode resolver
     keeps its own explicit source/videoUrl logic untouched. */
  function detectVideoSource(raw) {
    const val = (raw || "").trim();
    if (!val) return { type: null };
    if (isDirectVideoUrl(val)) return { type: "direct", url: val };
    const ytId = extractYoutubeId(val);
    if (ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)) return { type: "youtube", id: ytId };
    return { type: null };
  }

  AnimeHub.data = {
    fetchData, getAll, getAnimeOnly, getMoviesOnly, getById, getGenres, getStudios,
    getSocialLinks, getSiteInfo, getGenreMeta, getNews, getGenreInfo, resolveTheme,
    getByGenre, sortList, filterList, paginate,
    trendingScore, Rows,
  };
  AnimeHub.render = { renderCard, renderCwCard, renderSkeletonCards, escapeHtml, starIcon, plusIcon, checkIcon, heartIcon };
  AnimeHub.util = { extractYoutubeId, isDirectVideoUrl, detectVideoSource };
})();