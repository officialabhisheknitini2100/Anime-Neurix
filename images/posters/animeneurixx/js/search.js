/* =========================================================
   ANIMEHUB · search.js
   Live search overlay shared by every page (nav search icon).
   Fuzzy matching = substring match OR Levenshtein distance <= 2
   on the title, so small typos still resolve to the right show.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const HISTORY_KEY = "animehub:search-history";
  const MAX_HISTORY = 8;

  function levenshtein(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  function fuzzyMatch(query, title) {
    const q = query.toLowerCase().trim();
    const t = title.toLowerCase();
    if (!q) return 0;
    if (t.includes(q)) return 100 - Math.abs(t.length - q.length);
    const words = t.split(/\s+/);
    let best = 0;
    words.forEach((w) => {
      const dist = levenshtein(q, w);
      const tolerance = q.length <= 4 ? 1 : 2;
      if (dist <= tolerance) best = Math.max(best, 60 - dist * 10);
    });
    return best;
  }

  function searchCatalog(query, limit) {
    const all = AnimeHub.data.getAll();
    if (!query.trim()) return [];
    const scored = all
      .map((item) => {
        let score = fuzzyMatch(query, item.title) * 2;
        score += (item.genres || []).some((g) => fuzzyMatch(query, g) > 50) ? 20 : 0;
        score += fuzzyMatch(query, item.studio || "") > 50 ? 15 : 0;
        score += (item.characters || []).some((c) => fuzzyMatch(query, c.name) > 50) ? 12 : 0;
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 8)
      .map((x) => x.item);
    return scored;
  }

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  }
  function pushHistory(term) {
    if (!term.trim()) return;
    let h = readHistory().filter((t) => t.toLowerCase() !== term.toLowerCase());
    h.unshift(term);
    h = h.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  }
  function clearHistory() { localStorage.removeItem(HISTORY_KEY); }

  function highlight(text, query) {
    if (!query.trim()) return AnimeHub.render.escapeHtml(text);
    const safe = AnimeHub.render.escapeHtml(text);
    const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp("(" + q + ")", "ig"), "<mark>$1</mark>");
  }

  function trendingSearchTerms() {
    return AnimeHub.data.Rows.trendingWorldwide(6).map((i) => i.title);
  }

  let activeIndex = -1;

  function buildOverlay() {
    if (document.getElementById("search-overlay")) return;
    const el = document.createElement("div");
    el.id = "search-overlay";
    el.className = "search-overlay";
    el.innerHTML = `
      <div class="search-panel">
        <div class="search-input-wrap glass gradient-border">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="text" id="search-input" placeholder="Search by title, genre, studio or character…" autocomplete="off" aria-label="Search Anime NeuriX">
          <button class="search-close icon-btn" id="search-close-btn" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="search-body" id="search-body"></div>
      </div>`;
    document.body.appendChild(el);

    const input = el.querySelector("#search-input");
    const body = el.querySelector("#search-body");
    el.querySelector("#search-close-btn").addEventListener("click", closeOverlay);
    el.addEventListener("click", (e) => { if (e.target === el) closeOverlay(); });

    function renderDefault() {
      const history = readHistory();
      const trending = trendingSearchTerms();
      body.innerHTML = `
        ${history.length ? `
          <div class="search-section-label">Recent Searches</div>
          <div class="search-chip-row">${history.map((h) => `<button class="search-chip" data-term="${AnimeHub.render.escapeHtml(h)}">${AnimeHub.render.escapeHtml(h)}</button>`).join("")}</div>
        ` : ""}
        <div class="search-section-label">Trending Searches</div>
        <div class="search-chip-row">${trending.map((h) => `<button class="search-chip" data-term="${AnimeHub.render.escapeHtml(h)}">🔥 ${AnimeHub.render.escapeHtml(h)}</button>`).join("")}</div>
      `;
    }

    function renderResults(query) {
      const results = searchCatalog(query, 10);
      activeIndex = -1;
      if (!results.length) {
        body.innerHTML = `<div class="state-block" style="padding:40px 10px;"><div class="state-icon">🔍</div><h3>No matches</h3><p>Try a different title, genre or studio.</p></div>`;
        return;
      }
      body.innerHTML = `
        <div class="search-section-label">Results</div>
        ${results.map((item) => `
          <a class="search-result-item" href="anime-details.html?id=${item.id}" data-term="${AnimeHub.render.escapeHtml(item.title)}">
            <img src="${item.poster}" alt="">
            <div>
              <div class="search-result-title">${highlight(item.title, query)}</div>
              <div class="search-result-meta">${item.category === "movie" ? "Movie" : "Series"} · ${item.releaseYear} · ★ ${item.rating.toFixed(1)}</div>
            </div>
          </a>`).join("")}
      `;
    }

    input.addEventListener("input", () => {
      const q = input.value;
      q.trim() ? renderResults(q) : renderDefault();
    });

    body.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-term]");
      if (chip && chip.tagName === "BUTTON") {
        input.value = chip.dataset.term;
        renderResults(chip.dataset.term);
        input.focus();
      } else if (chip) {
        pushHistory(chip.dataset.term);
      }
    });

    input.addEventListener("keydown", (e) => {
      const items = Array.from(body.querySelectorAll(".search-result-item"));
      if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(items.length - 1, activeIndex + 1); updateActive(items); }
      if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); updateActive(items); }
      if (e.key === "Enter") {
        if (activeIndex >= 0 && items[activeIndex]) { pushHistory(input.value); items[activeIndex].click(); }
        else if (input.value.trim()) { pushHistory(input.value); renderResults(input.value); }
      }
      if (e.key === "Escape") closeOverlay();
    });

    function updateActive(items) {
      items.forEach((it, i) => it.classList.toggle("kb-active", i === activeIndex));
      if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: "nearest" });
    }

    el._renderDefault = renderDefault;
    el._input = input;
  }

  function openOverlay() {
    buildOverlay();
    const el = document.getElementById("search-overlay");
    el._renderDefault();
    el.classList.add("open");
    document.body.classList.add("no-scroll");
    setTimeout(() => el._input.focus(), 50);
  }
  function closeOverlay() {
    const el = document.getElementById("search-overlay");
    if (!el) return;
    el.classList.remove("open");
    document.body.classList.remove("no-scroll");
    el._input.value = "";
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-search]")) openOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "k" || e.key === "/") && (e.ctrlKey || e.metaKey || e.key === "/")) {
      const typingInField = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
      if (e.key === "/" && typingInField) return;
      e.preventDefault();
      openOverlay();
    }
  });

  AnimeHub.search = { searchCatalog, fuzzyMatch, levenshtein, openOverlay, closeOverlay, pushHistory, clearHistory };
})();
