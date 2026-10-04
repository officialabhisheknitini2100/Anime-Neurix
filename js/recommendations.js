/* =========================================================
   ANIMEHUB · recommendations.js
   Lightweight content-based recommender driven entirely by
   localStorage signals: favorites, continue-watching and
   recently-viewed titles. No server, no tracking beyond
   the visitor's own browser.
   ========================================================= */
(function () {
  "use strict";
  const VIEWS_KEY = "animehub:recently-viewed";
  const MAX_RECENT = 20;
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY)) || []; }
    catch (e) { return []; }
  }
  function trackView(id) {
    let arr = readRecent().filter((x) => x !== id);
    arr.unshift(id);
    arr = arr.slice(0, MAX_RECENT);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(arr));
  }
  function getRecentItems() {
    const data = AnimeHub.data;
    return readRecent().map((id) => data.getById(id)).filter(Boolean);
  }

  /* Tally genre weight from every behavioural signal we have */
  function genreWeights() {
    const weights = {};
    const bump = (genres, w) => (genres || []).forEach((g) => (weights[g] = (weights[g] || 0) + w));

    (AnimeHub.favorites ? AnimeHub.favorites.getItems() : []).forEach((i) => bump(i.genres, 3));
    (AnimeHub.continueWatching ? AnimeHub.continueWatching.getAllSorted() : []).forEach((cw) => {
      const item = AnimeHub.data.getById(cw.animeId);
      if (item) bump(item.genres, 2);
    });
    getRecentItems().forEach((i) => bump(i.genres, 1));
    return weights;
  }

  function scoreBySharedGenres(item, weights) {
    return (item.genres || []).reduce((sum, g) => sum + (weights[g] || 0), 0);
  }

  function excludeIds() {
    const set = new Set();
    (AnimeHub.favorites ? AnimeHub.favorites.readIds() : []).forEach((id) => set.add(id));
    return set;
  }

  /* "Recommended For You": ranks the whole catalog by genre affinity + rating,
     falls back to general trending list when there's no signal yet (new visitor). */
  function recommendedForYou(n, categoryFilter) {
    const weights = genreWeights();
    const excl = excludeIds();
    let pool = AnimeHub.data.getAll().filter((a) => !excl.has(a.id));
    if (categoryFilter) pool = pool.filter((a) => a.category === categoryFilter);

    const hasSignal = Object.keys(weights).length > 0;
    if (!hasSignal) return AnimeHub.data.sortList(pool, "trending").slice(0, n);

    return pool
      .map((item) => ({ item, score: scoreBySharedGenres(item, weights) * 4 + item.rating }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((x) => x.item);
  }

  /* "Because You Watched <X>": similar titles to the most recent continue-watching / viewed item */
  function becauseYouWatched(n) {
    const recent = getRecentItems();
    const cw = AnimeHub.continueWatching ? AnimeHub.continueWatching.getAllSorted() : [];
    const anchorId = cw[0] ? cw[0].animeId : (recent[0] ? recent[0].id : null);
    const anchor = anchorId ? AnimeHub.data.getById(anchorId) : null;
    if (!anchor) return { anchor: null, items: [] };
    return { anchor, items: similarTo(anchor.id, n) };
  }

  /* "Similar Anime" used on the details page */
  function similarTo(id, n) {
    const base = AnimeHub.data.getById(id);
    if (!base) return [];
    return AnimeHub.data.getAll()
      .filter((a) => a.id !== id)
      .map((item) => {
        const shared = (item.genres || []).filter((g) => (base.genres || []).includes(g)).length;
        const sameCategory = item.category === base.category ? 1 : 0;
        return { item, score: shared * 5 + sameCategory * 2 + item.rating * 0.3 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((x) => x.item);
  }

  /* "Trending In Your Genres" */
  function trendingInYourGenres(n) {
    const weights = genreWeights();
    const topGenres = Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    let pool = AnimeHub.data.getAll();
    if (topGenres.length) pool = pool.filter((a) => (a.genres || []).some((g) => topGenres.includes(g)));
    return { genres: topGenres, items: AnimeHub.data.sortList(pool, "trending").slice(0, n) };
  }

  AnimeHub.recommend = { trackView, getRecentItems, recommendedForYou, becauseYouWatched, similarTo, trendingInYourGenres, genreWeights };
})();
