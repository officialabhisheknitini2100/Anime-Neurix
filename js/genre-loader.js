/* =========================================================
   ANIMEHUB · genre-loader.js
   Powers genre.html. Each genre opens its own URL
   (genre.html?genre=Action) instead of scrolling the homepage.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const PER_PAGE = 12;

  /* ============ GENRE-SPECIFIC CINEMATIC OPENING ============ */
  const BESPOKE_THEMES = { Action: "action", Fantasy: "fantasy", Romance: "romance", Horror: "horror", "Sci-Fi": "scifi" };

  function buildCinematicContent(type, glowColor) {
    switch (type) {
      case "action": {
        let sparks = "";
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const dist = 90 + Math.random() * 60;
          sparks += `<span class="spark" style="--sx:${Math.cos(angle) * dist}px;--sy:${Math.sin(angle) * dist}px;"></span>`;
        }
        return `<div class="blade left"></div><div class="blade right"></div><div class="clash-flash"></div>${sparks}`;
      }
      case "fantasy": {
        const runes = ["✦", "✧", "⟁", "⟡", "✺", "❂"];
        let runeHtml = "";
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const r = 26;
          runeHtml += `<span class="rune" style="margin:-0.7em; transform: translate(${Math.cos(angle) * r}vh, ${Math.sin(angle) * r}vh); animation-delay:${0.2 + i * 0.08}s;">${runes[i % runes.length]}</span>`;
        }
        return `<div class="swirl"></div><div class="magic-circle"></div>${runeHtml}`;
      }
      case "romance": {
        let hearts = "";
        for (let i = 0; i < 9; i++) {
          const left = 10 + Math.random() * 80;
          const delay = Math.random() * 0.6;
          const size = 1.1 + Math.random() * 1;
          hearts += `<span class="heart-particle" style="left:${left}%; animation-delay:${delay}s; font-size:${size}rem;">♥</span>`;
        }
        return hearts;
      }
      case "horror": {
        return `<div class="fog-blob" style="top:20%; left:-10%;"></div>
                <div class="fog-blob" style="top:50%; left:30%; animation-delay:.2s;"></div>
                <div class="fog-blob" style="top:70%; left:-20%; animation-delay:.4s;"></div>
                <div class="shadow-sweep"></div>`;
      }
      case "scifi": {
        return `<div class="hud-corner tl" style="animation-delay:.05s;"></div>
                <div class="hud-corner tr" style="animation-delay:.15s;"></div>
                <div class="hud-corner bl" style="animation-delay:.25s;"></div>
                <div class="hud-corner br" style="animation-delay:.35s;"></div>
                <div class="hud-scanline" style="top:0;"></div>`;
      }
      default: {
        let particles = "";
        for (let i = 0; i < 14; i++) {
          const left = Math.random() * 100;
          const delay = Math.random() * 0.8;
          particles += `<span class="generic-particle" style="left:${left}%; bottom:-10px; animation-delay:${delay}s;"></span>`;
        }
        return `<div class="generic-glow"></div>${particles}`;
      }
    }
  }

  function initGenreCinematic(genre) {
    const overlay = document.getElementById("genre-cinematic");
    if (!overlay) return Promise.resolve();
    const info = AnimeHub.data.getGenreInfo(genre);
    const type = BESPOKE_THEMES[genre] || "generic";
    overlay.style.setProperty("--cine-glow", info.themeAccent || info.themePrimary || "#8b2af0");
    overlay.innerHTML = `
      <div class="cinematic-bg"></div>
      ${buildCinematicContent(type, info.themeAccent)}
      <div class="cinematic-label">
        <span class="cinematic-icon">${info.icon || "🎬"}</span>
        <span class="cinematic-name">${genre}</span>
      </div>`;
    document.body.classList.add("no-scroll");
    return new Promise((resolve) => {
      setTimeout(() => {
        overlay.classList.add("hidden");
        document.body.classList.remove("no-scroll");
        setTimeout(() => { overlay.innerHTML = ""; resolve(); }, 550);
      }, 1800);
    });
  }

  function initGenrePage() {
    const root = document.getElementById("genre-page-root");
    if (!root) return;

    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category"); // "movie" -> Movies mode
    const genreParam = params.get("genre");

    // Three page modes, all served by this one existing file/URL:
    //  - "movies": ?category=movie            -> Movies tab (all movies, no genre lock)
    //  - "genre" : ?genre=X                    -> classic single-genre browse (unchanged)
    //  - "browse": neither param present       -> Browse tab (whole catalog)
    const mode = categoryParam === "movie" ? "movies" : (genreParam ? "genre" : "browse");
    const genre = genreParam || "";

    const state = { page: 1, sort: "popularity", query: "", filters: { genres: [], studios: [], status: [], category: [] } };

    const els = {
      bannerImg: document.getElementById("genre-banner-img"),
      eyebrow: document.getElementById("genre-eyebrow"),
      name: document.getElementById("genre-name"),
      count: document.getElementById("genre-count"),
      grid: document.getElementById("genre-grid"),
      search: document.getElementById("genre-search"),
      sort: document.getElementById("genre-sort"),
      badges: document.getElementById("filter-badges"),
      pagination: document.getElementById("pagination"),
      drawer: document.getElementById("filter-drawer"),
      drawerBody: document.getElementById("filter-drawer-body"),
      drawerTrigger: document.getElementById("filter-drawer-trigger"),
      drawerClose: document.getElementById("filter-drawer-close"),
      drawerApply: document.getElementById("filter-drawer-apply"),
      drawerClear: document.getElementById("filter-drawer-clear"),
      emptyState: document.getElementById("genre-empty-state"),
    };

    // Movies-mode genre chips read as "{Genre} Movies" (Crunchyroll-style
    // separate-feeling taxonomy) while still filtering on the exact same
    // shared `genres` field in anime-data.json — no JSON/schema changes.
    function genreChipLabel(g) { return mode === "movies" ? g + " Movies" : g; }

    function baseList() {
      let list;
      if (mode === "movies") list = AnimeHub.data.getMoviesOnly();
      else if (mode === "genre") list = AnimeHub.data.getByGenre(genre);
      else list = AnimeHub.data.getAll(); // browse: whole catalog

      list = AnimeHub.data.filterList(list, {
        genres: state.filters.genres,
        studios: state.filters.studios,
        status: state.filters.status,
        category: mode === "movies" ? ["movie"] : state.filters.category,
        query: state.query,
      });
      return AnimeHub.data.sortList(list, state.sort);
    }

    function renderBadges() {
      const chips = [];
      state.filters.genres.forEach((g) => chips.push({ type: "genres", value: g, label: mode === "movies" ? genreChipLabel(g) : "Genre: " + g }));
      state.filters.studios.forEach((s) => chips.push({ type: "studios", value: s, label: "Studio: " + s }));
      state.filters.status.forEach((s) => chips.push({ type: "status", value: s, label: s }));
      state.filters.category.forEach((c) => chips.push({ type: "category", value: c, label: c === "movie" ? "Movies" : "Series" }));

      if (!chips.length) { els.badges.innerHTML = ""; return; }
      els.badges.innerHTML = chips.map((c) => `
        <span class="filter-badge" data-type="${c.type}" data-value="${AnimeHub.render.escapeHtml(c.value)}">
          ${AnimeHub.render.escapeHtml(c.label)} <button aria-label="Remove filter">✕</button>
        </span>`).join("") + `<button class="clear-filters-btn">Clear all</button>`;
    }

    function renderPagination(totalPages) {
      if (totalPages <= 1) { els.pagination.innerHTML = ""; return; }
      let html = `<button class="page-btn" data-p="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`;
      for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || Math.abs(p - state.page) <= 1) {
          html += `<button class="page-btn ${p === state.page ? "active" : ""}" data-p="${p}">${p}</button>`;
        } else if (Math.abs(p - state.page) === 2) {
          html += `<span class="page-ellipsis">…</span>`;
        }
      }
      html += `<button class="page-btn" data-p="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""} aria-label="Next page">›</button>`;
      els.pagination.innerHTML = html;
    }

    function draw() {
      const filtered = baseList();
      const { items, page, totalPages, total } = AnimeHub.data.paginate(filtered, state.page, PER_PAGE);
      state.page = page;

      els.count.textContent = total + (total === 1 ? " title" : " titles");
      renderBadges();

      if (!items.length) {
        els.grid.innerHTML = "";
        els.emptyState.style.display = "block";
      } else {
        els.emptyState.style.display = "none";
        els.grid.innerHTML = items.map(AnimeHub.render.renderCard).join("");
        AnimeHub.ui && AnimeHub.ui.observeReveal && AnimeHub.ui.observeReveal();
      }
      renderPagination(totalPages);
    }

    function pageDisplayName() {
      if (mode === "movies") return "Movies";
      if (mode === "browse") return "Browse All";
      return genre;
    }
    function paintHeader() {
      const displayName = pageDisplayName();
      const sample = mode === "movies" ? AnimeHub.data.getMoviesOnly()[0]
        : mode === "browse" ? AnimeHub.data.getAll()[0]
        : AnimeHub.data.getByGenre(genre)[0];
      els.bannerImg.src = sample ? sample.banner : "images/banners/" + (AnimeHub.data.getAll()[0] || {}).id + ".jpg";
      els.name.textContent = displayName;
      if (els.eyebrow) els.eyebrow.textContent = mode === "movies" ? "Movies" : mode === "browse" ? "Discover" : "Genre";
      document.title = displayName + " Anime & Movies · Anime NeuriX";
    }

    function buildDrawer() {
      const studios = AnimeHub.data.getStudios();
      const genres = AnimeHub.data.getGenres();
      els.drawerBody.innerHTML = `
        <div>
          <div class="filter-group-title">Genre</div>
          <div class="filter-options" data-group="genres">
            ${genres.map((g) => `<label class="filter-chip"><input type="checkbox" value="${g}">${genreChipLabel(g)}</label>`).join("")}
          </div>
        </div>
        ${mode === "movies" ? "" : `
        <div>
          <div class="filter-group-title">Category</div>
          <div class="filter-options" data-group="category">
            <label class="filter-chip"><input type="checkbox" value="anime">Series</label>
            <label class="filter-chip"><input type="checkbox" value="movie">Movies</label>
          </div>
        </div>`}
        <div>
          <div class="filter-group-title">Status</div>
          <div class="filter-options" data-group="status">
            <label class="filter-chip"><input type="checkbox" value="Ongoing">Ongoing</label>
            <label class="filter-chip"><input type="checkbox" value="Completed">Completed</label>
          </div>
        </div>
        <div>
          <div class="filter-group-title">Studio</div>
          <div class="filter-options" data-group="studios">
            ${studios.map((s) => `<label class="filter-chip"><input type="checkbox" value="${s}">${s}</label>`).join("")}
          </div>
        </div>`;

      els.drawerBody.querySelectorAll(".filter-chip").forEach((label) => {
        label.addEventListener("click", () => {
          setTimeout(() => label.classList.toggle("checked", label.querySelector("input").checked), 0);
        });
      });
    }

    function pendingFilters() {
      const groups = ["genres", "category", "status", "studios"];
      const result = {};
      groups.forEach((g) => {
        result[g] = Array.from(els.drawerBody.querySelectorAll(`[data-group="${g}"] input:checked`)).map((i) => i.value);
      });
      return result;
    }

    function syncDrawerFromState() {
      els.drawerBody.querySelectorAll(".filter-chip").forEach((label) => {
        const input = label.querySelector("input");
        const group = label.closest("[data-group]").dataset.group;
        input.checked = (state.filters[group] || []).includes(input.value);
        label.classList.toggle("checked", input.checked);
      });
    }

    function openDrawer() { buildDrawer(); syncDrawerFromState(); els.drawer.classList.add("open"); document.body.classList.add("no-scroll"); }
    function closeDrawer() { els.drawer.classList.remove("open"); document.body.classList.remove("no-scroll"); }

    els.drawerTrigger && els.drawerTrigger.addEventListener("click", openDrawer);
    els.drawerClose && els.drawerClose.addEventListener("click", closeDrawer);
    els.drawerApply && els.drawerApply.addEventListener("click", () => {
      state.filters = pendingFilters();
      state.page = 1;
      closeDrawer();
      draw();
    });
    els.drawerClear && els.drawerClear.addEventListener("click", () => {
      els.drawerBody.querySelectorAll("input:checked").forEach((i) => (i.checked = false));
      els.drawerBody.querySelectorAll(".filter-chip.checked").forEach((l) => l.classList.remove("checked"));
    });

    els.badges.addEventListener("click", (e) => {
      const clearAll = e.target.closest(".clear-filters-btn");
      if (clearAll) { state.filters = { genres: [], studios: [], status: [], category: [] }; state.page = 1; draw(); return; }
      const chip = e.target.closest(".filter-badge");
      if (chip && e.target.tagName === "BUTTON") {
        const { type, value } = chip.dataset;
        state.filters[type] = state.filters[type].filter((v) => v !== value);
        state.page = 1;
        draw();
      }
    });

    els.search.addEventListener("input", () => { state.query = els.search.value; state.page = 1; draw(); });
    els.sort.addEventListener("change", () => { state.sort = els.sort.value; draw(); });
    els.pagination.addEventListener("click", (e) => {
      const btn = e.target.closest(".page-btn");
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.p);
      draw();
      document.getElementById("genre-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // Paint skeleton grid immediately — sync, before fetch, guarantees at
    // least one rendered frame of shimmer even when data is cached.
    if (els.grid && AnimeHub.render) {
      els.grid.innerHTML = AnimeHub.render.renderSkeletonCards(12);
    }

    // Use double-rAF to ensure the skeleton frame paints before draw() runs.
    // On fast local connections the fetch resolves in <1ms, so a single rAF
    // isn't enough — the browser hasn't committed the frame yet.
    AnimeHub.data.fetchData().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        paintHeader();
        draw();
        initGenreCinematic(pageDisplayName());
      }));
    });
  }

  document.addEventListener("DOMContentLoaded", initGenrePage);
})();