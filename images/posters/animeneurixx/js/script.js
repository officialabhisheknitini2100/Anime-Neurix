/* =========================================================
   ANIMEHUB · script.js
   Boots the whole app: loading screen → fetch data → wire nav,
   footer, homepage rows, details page, and shared UI behaviours.
   Load this file LAST (after the other js/*.js modules).
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  /* ---------- 1. PREFERENCES ---------- */
  const PREFS_KEY = "animehub:prefs";
  function readPrefs() { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } }
  function getPref(key, fallback) { const p = readPrefs(); return key in p ? p[key] : fallback; }
  function setPref(key, value) { const p = readPrefs(); p[key] = value; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
  AnimeHub.prefs = { get: getPref, set: setPref };

  /* ---------- 2. TOASTS ---------- */
  function ensureToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; document.body.appendChild(stack); }
    return stack;
  }
  function toast(message) {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast fade-up";
    el.innerHTML = `<span class="dot-icon"></span><span>${AnimeHub.render ? AnimeHub.render.escapeHtml(message) : message}</span>`;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; el.style.transition = "all .3s"; setTimeout(() => el.remove(), 300); }, 2400);
  }

  /* ---------- 3. SCROLL REVEAL ---------- */
  let observer = null;
  function observeReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-visible"));
      return;
    }
    if (!observer) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    }
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => observer.observe(el));
  }

  /* ---------- 4. BACK TO TOP ---------- */
  function initBackToTop() {
    const btn = document.getElementById("back-to-top");
    if (!btn) return;
    window.addEventListener("scroll", () => btn.classList.toggle("show", window.scrollY > 480), { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ---------- 5. LOADING SCREEN ---------- */
  const VISITED_KEY = "animehub:has-visited";
  function initLoadingScreen(dataPromise) {
    const screen = document.getElementById("loading-screen");
    if (!screen) return dataPromise;

    const firstVisitEver = !localStorage.getItem(VISITED_KEY);
    localStorage.setItem(VISITED_KEY, "1");

    if (!firstVisitEver) {
      // Returning visitor: skip the cinematic takeover entirely, fade out fast.
      return dataPromise.then(() => {
        screen.classList.add("hidden");
        document.body.classList.remove("no-scroll");
        setTimeout(() => screen.remove(), 350);
      });
    }

    const particlesWrap = screen.querySelector(".loader-particles");
    if (particlesWrap) {
      let html = "";
      for (let i = 0; i < 26; i++) {
        const left = Math.random() * 100;
        const delay = Math.random() * 6;
        const duration = 6 + Math.random() * 6;
        html += `<span style="left:${left}%;bottom:-10px;animation-delay:${delay}s;animation-duration:${duration}s;"></span>`;
      }
      particlesWrap.innerHTML = html;
    }
    const fill = screen.querySelector(".loader-bar-fill");
    let progress = 0;
    const tick = setInterval(() => {
      progress = Math.min(92, progress + Math.random() * 14);
      if (fill) fill.style.width = progress + "%";
    }, 180);

    const minWait = new Promise((res) => setTimeout(res, 1100));
    return Promise.all([dataPromise, minWait]).then(() => {
      clearInterval(tick);
      if (fill) fill.style.width = "100%";
      setTimeout(() => {
        screen.classList.add("hidden");
        document.body.classList.remove("no-scroll");
        setTimeout(() => screen.remove(), 800);
      }, 250);
    });
  }

  /* ---------- 5b. SKELETON LOADING (instant placeholder content) ---------- */
  function paintSkeletons() {
    document.querySelectorAll(".row-scroller").forEach((row) => {
      if (!row.children.length) row.innerHTML = AnimeHub.render.renderSkeletonCards(6);
    });
    document.querySelectorAll("#genre-grid, #watchlist-grid, #favorites-grid").forEach((grid) => {
      if (!grid.children.length) grid.innerHTML = AnimeHub.render.renderSkeletonCards(10);
    });
  }

  /* ---------- 6. NAVIGATION ---------- */
  function initNav() {
    const nav = document.getElementById("navbar");
    if (nav) {
      const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 12);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    const toggle = document.getElementById("nav-toggle");
    const mobileNav = document.getElementById("mobile-nav");
    const scrim = document.getElementById("nav-scrim");
    function closeMobile() { mobileNav && mobileNav.classList.remove("open"); scrim && scrim.classList.remove("open"); document.body.classList.remove("no-scroll"); }
    if (toggle && mobileNav) {
      toggle.addEventListener("click", () => {
        const willOpen = !mobileNav.classList.contains("open");
        mobileNav.classList.toggle("open", willOpen);
        scrim && scrim.classList.toggle("open", willOpen);
        document.body.classList.toggle("no-scroll", willOpen);
      });
      scrim && scrim.addEventListener("click", closeMobile);
      mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMobile));
    }
    // highlight current page link
    const file = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a, .mobile-nav a").forEach((a) => {
      const href = a.getAttribute("href").split("?")[0];
      if (href === file || (file === "" && href === "index.html")) a.classList.add("active");
    });
    // favorites/watchlist nav badges
    refreshNavBadges();
    document.addEventListener("animehub:favorites-changed", refreshNavBadges);
    document.addEventListener("animehub:watchlist-changed", refreshNavBadges);
  }
  function refreshNavBadges() {
    document.querySelectorAll(".js-wl-count").forEach((el) => {
      const n = AnimeHub.watchlist ? AnimeHub.watchlist.count() : 0;
      el.textContent = n; el.style.display = n ? "grid" : "none";
    });
    document.querySelectorAll(".js-fav-count").forEach((el) => {
      const n = AnimeHub.favorites ? AnimeHub.favorites.count() : 0;
      el.textContent = n; el.style.display = n ? "grid" : "none";
    });
  }

  /* ---------- 7. FAVORITE / WATCHLIST BUTTON DELEGATION (works on every page) ---------- */
  function initActionDelegation() {
    document.addEventListener("click", (e) => {
      const favBtn = e.target.closest(".js-fav-btn");
      if (favBtn) {
        const id = favBtn.dataset.id;
        const nowOn = AnimeHub.favorites.toggle(id);
        favBtn.classList.toggle("is-active", nowOn);
        toast(nowOn ? "Added to Favorites" : "Removed from Favorites");
        return;
      }
      const wlBtn = e.target.closest(".js-wl-btn");
      if (wlBtn) {
        const id = wlBtn.dataset.id;
        const nowOn = AnimeHub.watchlist.toggle(id);
        wlBtn.classList.toggle("is-active", nowOn);
        const hadLabel = !!wlBtn.querySelector("span");
        const icon = nowOn ? AnimeHub.render.checkIcon() : AnimeHub.render.plusIcon();
        wlBtn.innerHTML = hadLabel ? `${icon}<span>${nowOn ? "In Watchlist" : "Add To Watchlist"}</span>` : icon;
        toast(nowOn ? "Added to Watchlist" : "Removed from Watchlist");
      }
    });
  }

  /* ---------- 8. FOOTER (everything sourced from anime-data.json) ---------- */
  function initFooter() {
    const footer = document.getElementById("site-footer");
    if (!footer) return;
    const social = AnimeHub.data.getSocialLinks();
    const genres = AnimeHub.data.getGenres();
    const site = AnimeHub.data.getSiteInfo();

    const ICONS = {
      instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.85.06 1.17.05 1.96.24 2.43.4a4.9 4.9 0 011.77 1.15 4.9 4.9 0 011.15 1.77c.16.47.35 1.26.4 2.43.06 1.25.06 1.65.06 4.85s0 3.6-.06 4.85c-.05 1.17-.24 1.96-.4 2.43a4.9 4.9 0 01-1.15 1.77 4.9 4.9 0 01-1.77 1.15c-.47.16-1.26.35-2.43.4-1.25.06-1.65.06-4.85.06s-3.6 0-4.85-.06c-1.17-.05-1.96-.24-2.43-.4a4.9 4.9 0 01-1.77-1.15 4.9 4.9 0 01-1.15-1.77c-.16-.47-.35-1.26-.4-2.43C2.2 15.6 2.2 15.2 2.2 12s0-3.6.06-4.85c.05-1.17.24-1.96.4-2.43A4.9 4.9 0 012.81 2.95 4.9 4.9 0 014.58 1.8c.47-.16 1.26-.35 2.43-.4C8.26 1.34 8.66 1.34 12 1.34zm0 3.06a5.74 5.74 0 100 11.48 5.74 5.74 0 000-11.48zm0 9.47a3.73 3.73 0 110-7.46 3.73 3.73 0 010 7.46zm6.9-9.7a1.34 1.34 0 11-2.68 0 1.34 1.34 0 012.68 0z"/></svg>',
      telegram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.95 5.5l-3.36 15.85c-.25 1.1-.92 1.38-1.86.86l-5.13-3.78-2.47 2.38c-.27.27-.5.5-1.02.5l.37-5.22 9.5-8.59c.41-.37-.09-.57-.64-.2L7.06 13.1l-5.1-1.6c-1.1-.35-1.12-1.1.23-1.62L20.6 4.07c.92-.34 1.72.21 1.35 1.43z"/></svg>',
      twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2h3.2l-7 8 8.2 12h-6.4l-5-6.6L5.7 22H2.5l7.5-8.6L2.2 2h6.5l4.5 6 5.7-6z"/></svg>',
      discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 5.3A18 18 0 0015.7 4l-.3.6a13 13 0 014 1.6 16 16 0 00-15.4 0 13 13 0 014-1.6L7.7 4a18 18 0 00-4.6 1.3S.5 9.6.5 16.6a13 13 0 003.8 1.9l.9-1.4a9 9 0 01-1.6-.8l.4-.3a13 13 0 0015.9 0l.4.3a9 9 0 01-1.6.8l.9 1.4a13 13 0 003.8-1.9c0-7-2.6-11.3-2.6-11.3zM8.8 14.5c-.8 0-1.5-.8-1.5-1.7 0-1 .6-1.8 1.5-1.8s1.5.8 1.5 1.8c0 .9-.7 1.7-1.5 1.7zm6.4 0c-.8 0-1.5-.8-1.5-1.7 0-1 .7-1.8 1.5-1.8s1.5.8 1.5 1.8c0 .9-.6 1.7-1.5 1.7z"/></svg>',
      youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.2s-.2-1.6-.9-2.3c-.8-.9-1.7-.9-2.2-1C16.6 3.6 12 3.6 12 3.6h0s-4.6 0-7.9.3c-.5.1-1.4.1-2.2 1C1.2 5.6 1 7.2 1 7.2S.8 9 .8 10.9v2c0 1.9.2 3.7.2 3.7s.2 1.6.9 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.7.3 7.7.3s4.6 0 7.9-.3c.5-.1 1.4-.1 2.2-1 .7-.7.9-2.3.9-2.3s.2-1.8.2-3.7v-2c0-1.9-.2-3.7-.2-3.7zM9.7 14.8V8.6l6 3.1z"/></svg>',
    };

    const socialKeys = Object.keys(ICONS).filter((k) => social[k]);
    footer.innerHTML = `
      <div class="footer-glow"></div>
      <div class="container">
        <div class="footer-grid">
          <div class="footer-col footer-brand">
            <a href="index.html" class="brand"><img src="images/logos/logo-horizontal.png" alt="${site.name}" style="height:32px;width:auto;"></a>
            <p>${site.tagline || ""} — discover, track and organize every series and movie you love, all in one premium dashboard.</p>
          </div>
          <div class="footer-col">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="index.html">Home</a></li>
              <li><a href="index.html#section-series">Series</a></li>
              <li><a href="index.html#section-movies">Movies</a></li>
              <li><a href="watchlist.html">My Watchlist</a></li>
              <li><a href="favorites.html">My Favorites</a></li>
            </ul>
          </div>
          <div class="footer-col genres-col">
            <h4>Genres</h4>
            <ul>${genres.slice(0, 6).map((g) => `<li><a href="genre.html?genre=${encodeURIComponent(g)}">${g}</a></li>`).join("")}</ul>
          </div>
          <div class="footer-col">
            <h4>More Genres</h4>
            <ul>${genres.slice(6, 12).map((g) => `<li><a href="genre.html?genre=${encodeURIComponent(g)}">${g}</a></li>`).join("")}</ul>
          </div>
        </div>

        <div class="social-hub">
          <div class="social-hub-text">
            <h3>Join the ${site.name || "Anime NeuriX"} community</h3>
            <p>Follow along for new drops, polls and behind-the-scenes art.</p>
          </div>
          <div class="social-icons">
            ${socialKeys.map((k) => `
              <a class="social-icon" href="${social[k]}" target="_blank" rel="noopener noreferrer" aria-label="${k}">
                ${ICONS[k]}
              </a>`).join("")}
          </div>
        </div>

        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} ${site.name || "Anime NeuriX"}. All artwork is placeholder demo art.</span>
          <span>Created By Abhishek Yadav</span>
        </div>
      </div>`;
  }

  /* ---------- 9. HOMEPAGE ROWS ---------- */
  const ROW_CONFIG = [
    { id: "trending-anime", get: (R) => R.trendingAnime(14) },
    { id: "top-rated-anime", get: (R) => R.topRatedAnime(14) },
    { id: "popular-series", get: (R) => R.popularSeries(14) },
    { id: "latest-episodes", get: (R) => R.latestEpisodes(14) },
    { id: "recommended-for-you", get: (_R, H) => H.recommend.recommendedForYou(14) },
    { id: "top-rated-movies", get: (R) => R.topRatedMovies(14) },
    { id: "most-watched-movies", get: (R) => R.mostWatchedMovies(14) },
    { id: "popular-movies", get: (R) => R.popularMovies(14) },
    { id: "latest-movies", get: (R) => R.latestMovies(14) },
    { id: "recommended-movies", get: (_R, H) => H.recommend.recommendedForYou(14, "movie") },
    { id: "trending-worldwide", get: (R) => R.trendingWorldwide(14) },
    { id: "highest-rated", get: (R) => R.highestRated(14) },
    { id: "rising-anime", get: (R) => R.risingAnime(14) },
    { id: "most-favorited", get: (R) => R.mostFavorited(14) },
    { id: "editor-choice", get: (R) => R.editorsChoice(14) },
  ];

  function renderRow(id, items) {
    const row = document.getElementById("row-" + id);
    if (!row) return;
    const section = document.getElementById("section-" + id);
    if (!items.length) { if (section) section.style.display = "none"; return; }
    row.innerHTML = items.map(AnimeHub.render.renderCard).join("");
    const link = document.getElementById("link-" + id);
    if (link && items[0]) {
      const g = (items[0].genres || [])[0];
      if (g) link.href = "genre.html?genre=" + encodeURIComponent(g);
    }
  }

  function initHomepageRows() {
    if (!document.getElementById("row-trending-anime")) return; // not the homepage
    const R = AnimeHub.data.Rows;
    ROW_CONFIG.forEach((cfg) => renderRow(cfg.id, cfg.get(R, AnimeHub)));

    // Because You Watched (bonus row, only appears once there's a signal)
    const byw = AnimeHub.recommend.becauseYouWatched(12);
    const bywSection = document.getElementById("section-because-you-watched");
    if (bywSection) {
      if (byw.anchor && byw.items.length) {
        bywSection.style.display = "";
        document.getElementById("because-you-watched-title").textContent = "Because You Watched " + byw.anchor.title;
        document.getElementById("row-because-you-watched").innerHTML = byw.items.map(AnimeHub.render.renderCard).join("");
      } else {
        bywSection.style.display = "none";
      }
    }

    // Genre tiles — premium SVG icons, taglines, anime count, hover explore button
    const tileGrid = document.getElementById("genre-tiles-grid");
    if (tileGrid) {
      const genres = AnimeHub.data.getGenres();

      // Premium inline SVG icons per genre (no emojis)
      const GENRE_SVGS = {
        "Action":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5l7 7-11 11L3 13.5l11-11z"/><path d="M8 15l-3 3M16 4l4 4"/></svg>`,
        "Fantasy":       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/></svg>`,
        "Romance":       `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
        "Comedy":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9" stroke-width="2.5"/><line x1="15" y1="9" x2="15.01" y2="9" stroke-width="2.5"/></svg>`,
        "Sports":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 000 20M12 2a14.5 14.5 0 010 20M2 12h20"/></svg>`,
        "Horror":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
        "Drama":         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>`,
        "Adventure":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
        "Slice of Life": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
        "Supernatural":  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
        "Sci-Fi":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
        "Mystery":       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        "Music":         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
        "School":        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`,
      };

      tileGrid.innerHTML = genres.map((g) => {
        const items = AnimeHub.data.getByGenre(g);
        const sample = items[0];
        const info = AnimeHub.data.getGenreInfo(g);
        const svg = GENRE_SVGS[g] || GENRE_SVGS["Mystery"];
        return `
        <a class="genre-tile" href="genre.html?genre=${encodeURIComponent(g)}" style="background-image:url('${sample ? sample.banner : ""}'); --tile-glow:${info.themeAccent || "rgba(139,42,240,.55)"};">
          <div class="genre-tile-icon" style="color:${info.themeAccent || "#c084fc"}; border-color:${info.themeAccent ? info.themeAccent + "44" : "rgba(255,255,255,.14)"};">${svg}</div>
          <span class="genre-tile-name">${g}</span>
          <span class="genre-tile-tagline">${AnimeHub.render.escapeHtml(info.tagline || "")}</span>
          <span class="genre-tile-count">${items.length} titles</span>
          <span class="genre-tile-explore">Explore →</span>
        </a>`;
      }).join("");
    }

    // Smooth scroll for data-scroll-to nav links (on index.html only)
    document.querySelectorAll("[data-scroll-to]").forEach((link) => {
      link.addEventListener("click", (e) => {
        const targetId = link.dataset.scrollTo;
        const target = document.getElementById(targetId);
        if (target) {
          e.preventDefault();
          const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72;
          const top = target.getBoundingClientRect().top + window.scrollY - navH - 12;
          window.scrollTo({ top, behavior: "smooth" });
        }
      });
    });

    initNewsSection();
    observeReveal();
  }

  /* ---------- 9b. ANIME NEWS ---------- */
  function initNewsSection() {
    const grid = document.getElementById("news-grid");
    if (!grid) return;
    const news = AnimeHub.data.getNews();
    grid.innerHTML = news.map((n) => `
      <article class="news-card">
        <div class="news-card-img"><img src="${n.image}" alt="${AnimeHub.render.escapeHtml(n.title)}" loading="lazy"></div>
        <div class="news-card-body">
          <span class="news-date">${formatNewsDate(n.date)}</span>
          <h3 class="news-title">${AnimeHub.render.escapeHtml(n.title)}</h3>
          <p class="news-summary">${AnimeHub.render.escapeHtml(n.summary)}</p>
          <button class="news-readmore" data-news-id="${n.id}">Read More →</button>
        </div>
      </article>`).join("");

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-news-id]");
      if (!btn) return;
      const article = news.find((n) => n.id === btn.dataset.newsId);
      if (article) openNewsModal(article);
    });
  }
  function formatNewsDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function openNewsModal(article) {
    let modal = document.getElementById("news-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "news-modal";
      modal.className = "modal-overlay";
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => { if (e.target === modal) closeNewsModal(); });
    }
    const related = article.relatedAnimeId ? AnimeHub.data.getById(article.relatedAnimeId) : null;
    modal.innerHTML = `
      <div class="modal-box modal-wide glass gradient-border" style="position:relative;">
        <button class="icon-btn modal-close-x" id="news-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <img src="${article.image}" alt="" style="width:100%; border-radius: var(--r-md); aspect-ratio:16/9; object-fit:cover; margin-bottom:18px;">
        <span class="news-date">${formatNewsDate(article.date)}</span>
        <h3 style="margin:8px 0 14px;">${AnimeHub.render.escapeHtml(article.title)}</h3>
        <p style="color:var(--text-secondary); line-height:1.75;">${AnimeHub.render.escapeHtml(article.summary)}</p>
        ${related ? `<a href="anime-details.html?id=${related.id}" class="btn btn-glow" style="margin-top:18px;">View ${AnimeHub.render.escapeHtml(related.title)}</a>` : ""}
      </div>`;
    document.getElementById("news-modal-close").addEventListener("click", closeNewsModal);
    modal.classList.add("open");
    document.body.classList.add("no-scroll");
  }
  function closeNewsModal() {
    const modal = document.getElementById("news-modal");
    if (!modal) return;
    modal.classList.remove("open");
    document.body.classList.remove("no-scroll");
  }

  /* ---------- 10. ANIME DETAILS PAGE ---------- */
  function initDetailsPage() {
    const root = document.getElementById("details-root");
    if (!root) return;
    const id = new URLSearchParams(location.search).get("id");
    const item = AnimeHub.data.getById(id) || AnimeHub.data.getAll()[0];
    if (!item) { root.innerHTML = '<div class="state-block"><h3>Title not found</h3></div>'; return; }

    AnimeHub.recommend.trackView(item.id);

    document.title = item.title + " · Anime NeuriX";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", item.description);
    setOgTags(item);

    document.getElementById("d-banner-img").src = item.banner;
    document.getElementById("d-poster-img").src = item.poster;
    document.getElementById("d-poster-img").alt = item.title + " poster";
    document.getElementById("d-title").textContent = item.title;
    document.getElementById("d-desc").textContent = item.description;
    document.getElementById("d-rating").textContent = item.rating.toFixed(1);
    document.getElementById("d-year").textContent = item.releaseYear;
    document.getElementById("d-status").textContent = item.status;
    document.getElementById("d-studio").textContent = item.studio;
    document.getElementById("d-type").textContent = item.category === "movie" ? "Movie" : "Series";
    document.getElementById("d-duration-or-eps").textContent = item.category === "movie" ? item.duration : `${item.totalSeasons} Season${item.totalSeasons > 1 ? "s" : ""} · ${item.episodeCount} Episodes`;
    document.getElementById("d-genres").innerHTML = (item.genres || []).map((g) => `<a class="search-chip" href="genre.html?genre=${encodeURIComponent(g)}">${g}</a>`).join("");

    const favBtn = document.getElementById("d-fav-btn");
    const wlBtn = document.getElementById("d-wl-btn");
    favBtn.classList.toggle("is-active", AnimeHub.favorites.has(item.id));
    favBtn.dataset.id = item.id;
    wlBtn.dataset.id = item.id;
    wlBtn.classList.toggle("is-active", AnimeHub.watchlist.has(item.id));
    paintWlButton(wlBtn, AnimeHub.watchlist.has(item.id));
    document.addEventListener("click", (e) => { if (e.target.closest("#d-wl-btn")) setTimeout(() => paintWlButton(wlBtn, AnimeHub.watchlist.has(item.id)), 0); });

    function paintWlButton(btn, on) {
      btn.innerHTML = (on ? AnimeHub.render.checkIcon() : AnimeHub.render.plusIcon()) + `<span>${on ? "In Watchlist" : "Add To Watchlist"}</span>`;
    }

    // Trailer
    const trailerSection = document.getElementById("d-trailer-section");
    const trailerFrame = document.getElementById("d-trailer-frame");
    const trailerFallback = document.getElementById("d-trailer-fallback");
    if (item.trailerYoutubeId) {
      trailerFrame.src = "https://www.youtube.com/embed/" + item.trailerYoutubeId;
      trailerFrame.style.display = "";
      trailerFallback.style.display = "none";
    } else {
      trailerFrame.style.display = "none";
      trailerFallback.style.display = "flex";
    }

    // Screenshots
    document.getElementById("d-screenshots").innerHTML = (item.screenshots || [])
      .map((src) => `<img src="${src}" alt="${item.title} screenshot" loading="lazy">`).join("");

    // Characters
    document.getElementById("d-characters").innerHTML = (item.characters || []).map((c) => `
      <div class="character-card glass">
        <img src="${c.avatar}" alt="${c.name}">
        <div class="character-name">${c.name}</div>
        <div class="character-role">${c.role}</div>
        <div class="character-va">VA: ${c.voiceActor}</div>
      </div>`).join("");

    // Seasons & episodes (Netflix-style accordion) — movies skip straight to a single watch card
    const seasonsWrap = document.getElementById("d-seasons");
    if (item.category === "movie") {
      seasonsWrap.innerHTML = `
        <div class="season-block open">
          <div class="episode-row">
            <div class="ep-thumb"><img src="${item.banner}" alt=""><span class="ep-play">▶</span></div>
            <div class="ep-info">
              <div class="ep-title">${item.title} <span class="ep-duration">${item.duration}</span></div>
              <p class="ep-desc">${item.description}</p>
            </div>
            ${watchButtonHtml(item.watchLink, item.id, 1, 1, item.banner)}
          </div>
        </div>`;
    } else {
      seasonsWrap.innerHTML = (item.seasons || []).map((season, si) => `
        <div class="season-block ${si === 0 ? "open" : ""}">
          <button class="season-toggle">
            <span>Season ${season.seasonNumber}</span>
            <span class="season-meta">${season.episodes.length} Episodes <i class="chev">⌄</i></span>
          </button>
          <div class="season-episodes">
            ${season.episodes.map((ep) => `
              <div class="episode-row">
                <div class="ep-thumb"><img src="${ep.thumbnail}" alt="" loading="lazy"><span class="ep-play">▶</span></div>
                <div class="ep-info">
                  <div class="ep-title">${ep.episodeNumber}. ${ep.title} <span class="ep-duration">${ep.duration}</span></div>
                  <p class="ep-desc">${ep.description}</p>
                </div>
                ${watchButtonHtml(ep.watchLink, item.id, season.seasonNumber, ep.episodeNumber, ep.thumbnail)}
              </div>`).join("")}
          </div>
        </div>`).join("");

      seasonsWrap.querySelectorAll(".season-toggle").forEach((btn) => {
        btn.addEventListener("click", () => btn.closest(".season-block").classList.toggle("open"));
      });
    }

    // Similar / Recommended (Related + Similar replaced by Community Comments per latest spec)
    fillRow("d-recommended", AnimeHub.recommend.recommendedForYou(12).filter((i) => i.id !== item.id));

    function fillRow(elId, items) {
      const el = document.getElementById(elId);
      if (!el) return;
      const section = document.getElementById(elId + "-section");
      if (!items.length) { if (section) section.style.display = "none"; return; }
      el.innerHTML = items.map(AnimeHub.render.renderCard).join("");
    }

    applyDetailsTheme(item);
    initCountdown(item);
    if (AnimeHub.comments) AnimeHub.comments.renderCommentsSection(item.id);

    observeReveal();
  }

  /* ---------- 10b. DYNAMIC THEME ENGINE ---------- */
  function applyDetailsTheme(item) {
    const root = document.getElementById("details-root");
    if (!root) return;
    const theme = AnimeHub.data.resolveTheme(item);
    if (!theme) { root.style.cssText = ""; return; }
    root.style.setProperty("--purple-1", theme.themePrimary);
    root.style.setProperty("--purple-2", theme.themeAccent || theme.themePrimary);
    root.style.setProperty("--red-accent", theme.themeAccent || theme.themePrimary);
    root.style.setProperty("--purple-glow", hexToRgba(theme.themePrimary, 0.55));
    root.style.setProperty("--purple-glow-soft", hexToRgba(theme.themePrimary, 0.25));
    root.style.setProperty("--red-glow", hexToRgba(theme.themeAccent || theme.themePrimary, 0.45));
    root.style.setProperty("--theme-accent", theme.themeAccent || theme.themePrimary);
    root.style.setProperty("--theme-secondary", theme.themeSecondary || "#0d0a1b");
  }
  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(139,42,240,${alpha})`;
    const h = hex.replace("#", "");
    const bigint = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  /* ---------- 10c. NEXT EPISODE COUNTDOWN ---------- */
  let countdownTimer = null;
  function initCountdown(item) {
    const card = document.getElementById("countdown-card");
    if (!card) return;
    if (countdownTimer) clearInterval(countdownTimer);
    if (!item.nextEpisode || !item.nextEpisode.airDateISO) { card.style.display = "none"; return; }

    card.style.display = "flex";
    document.getElementById("countdown-ep-label").textContent = "Next: " + item.nextEpisode.episodeLabel;
    const target = new Date(item.nextEpisode.airDateISO).getTime();
    const timerEl = document.getElementById("countdown-timer");

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        clearInterval(countdownTimer);
        timerEl.innerHTML = `<div class="countdown-released"><span>🎉 Episode Released!</span></div>`;
        const watchBtn = document.createElement("a");
        watchBtn.className = "btn btn-glow btn-sm";
        watchBtn.textContent = "Watch Now";
        watchBtn.href = "#d-seasons";
        watchBtn.addEventListener("click", (e) => { e.preventDefault(); document.getElementById("d-seasons").scrollIntoView({ behavior: "smooth" }); });
        timerEl.querySelector(".countdown-released").appendChild(watchBtn);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.innerHTML = [
        [days, "Days"], [hours, "Hrs"], [mins, "Min"], [secs, "Sec"],
      ].map(([v, label]) => `<div class="countdown-unit"><strong>${String(v).padStart(2, "0")}</strong><span>${label}</span></div>`).join("");
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function watchButtonHtml(link, animeId, season, episode, thumb) {
    const hasLink = link && link.trim();
    if (hasLink) {
      return `<a class="btn btn-glow btn-sm" href="${link}" target="_blank" rel="noopener noreferrer"
        data-track-episode data-anime-id="${animeId}" data-season="${season}" data-episode="${episode}" data-thumb="${thumb}">Watch</a>`;
    }
    return `<button class="btn btn-ghost btn-sm" disabled title="Admin: add a watchLink in anime-data.json">Link coming soon</button>`;
  }

  function setOgTags(item) {
    const set = (prop, content, isName) => {
      let el = document.querySelector(`meta[${isName ? "name" : "property"}="${prop}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(isName ? "name" : "property", prop); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    set("og:title", item.title + " · Anime NeuriX");
    set("og:description", item.description);
    set("og:image", item.banner);
    set("twitter:card", "summary_large_image", true);
    set("twitter:title", item.title, true);
    set("twitter:description", item.description, true);

    let ld = document.getElementById("ld-json");
    if (!ld) { ld = document.createElement("script"); ld.type = "application/ld+json"; ld.id = "ld-json"; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": item.category === "movie" ? "Movie" : "TVSeries",
      name: item.title,
      description: item.description,
      image: item.banner,
      datePublished: String(item.releaseYear),
      aggregateRating: { "@type": "AggregateRating", ratingValue: item.rating, bestRating: 10 },
    });
  }

  /* ---------- 11. MOUSE PARALLAX (hero, subtle) ---------- */
  function initParallax() {
    const hero = document.getElementById("hero");
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    hero.addEventListener("mousemove", (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 10;
      const y = (e.clientY / window.innerHeight - 0.5) * 6;
      const active = hero.querySelector(".hero-slide.active img");
      if (active) active.style.transform = `scale(1.05) translate(${x}px, ${y}px)`;
    });
  }

  /* ---------- 12. BOOT ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("no-scroll");
    initNav();
    initActionDelegation();
    initBackToTop();
    paintSkeletons();

    const dataPromise = AnimeHub.data.fetchData();
    initLoadingScreen(dataPromise).then(() => {
      initFooter();
      initHomepageRows();
      initDetailsPage();
      initParallax();
      observeReveal();
      document.dispatchEvent(new CustomEvent("animehub:data-ready"));
    });
  });

  AnimeHub.ui = { toast, observeReveal };
})();
