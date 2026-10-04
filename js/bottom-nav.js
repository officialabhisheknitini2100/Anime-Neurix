/* =========================================================
   ANIME NEURIX · bottom-nav.js
   ---------------------------------------------------------
   Mobile-only bottom navigation bar. Follows the exact same
   pattern script.js already uses for the footer: an empty
   placeholder (<div id="bottom-nav-mount"></div>) sits on every
   page, and this script injects the markup into it once. No
   markup is duplicated by hand across the 7 HTML pages.

   Badge counts reuse the existing .js-wl-count / .js-fav-count
   classes, so the badge-refresh listeners already wired up in
   watchlist.js and favorites.js (document.addEventListener(
   "animehub:watchlist-changed"/"animehub:favorites-changed", ...))
   update these badges automatically — no new event wiring here.

   Purely additive: does not read/write any AnimeHub state that
   isn't already exposed, does not alter routing, and renders
   nothing on tablet/desktop (mobile.css hides .bottom-nav at
   ≥768px regardless of DOM presence).
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  const TABS = [
    {
      key: "home",
      href: "index.html",
      label: "Home",
      match: (path) => path === "" || path === "index.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/></svg>',
    },
    {
      key: "browse",
      href: "genre.html",
      label: "Browse",
      match: () => false, // resolved by resolveActiveKey's genre.html special-case below
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    },
    {
      key: "watchlist",
      href: "watchlist.html",
      label: "Watchlist",
      match: (path) => path === "watchlist.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12v17l-6-4-6 4V4z"/></svg>',
      badgeClass: "js-wl-count",
    },
    {
      key: "movies",
      href: "genre.html?category=movie",
      label: "Movies",
      match: () => false, // resolved by resolveActiveKey's genre.html special-case below
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M7 4.5v15M17 4.5v15M2.5 9h4.5M17 9H21.5M2.5 15h4.5M17 15H21.5"/></svg>',
    },
    {
      key: "favorites",
      href: "favorites.html",
      label: "Favorites",
      match: (path) => path === "favorites.html",
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.3C.4 7.9 2.3 4 6.1 4 8.4 4 10.3 5.4 12 7.5 13.7 5.4 15.6 4 17.9 4c3.8 0 5.7 3.9 4.1 7.7C19.5 16.4 12 21 12 21z"/></svg>',
      badgeClass: "js-fav-count",
    },
  ];

  function currentPath() {
    const parts = location.pathname.split("/");
    return parts[parts.length - 1] || "";
  }

  function currentCategoryParam() {
    return new URLSearchParams(location.search).get("category") || "";
  }

  function resolveActiveKey(path) {
    // Special-case genre.html: it now serves three modes (see
    // genre-loader.js) — ?category=movie is the real Movies view,
    // anything else on genre.html (bare, or a specific ?genre=X visited
    // via a details-page genre chip) reads as "Browse" being the active
    // tab, since Browse is the general browsing hub.
    if (path === "genre.html") {
      return currentCategoryParam() === "movie" ? "movies" : "browse";
    }
    const hit = TABS.find((t) => t.match(path));
    return hit ? hit.key : "";
  }

  function render() {
    const mount = document.getElementById("bottom-nav-mount");
    if (!mount) return;

    const path = currentPath();
    const activeKey = resolveActiveKey(path);

    mount.innerHTML = `
      <nav class="bottom-nav" aria-label="Bottom navigation">
        ${TABS.map((t) => `
          <a class="bn-item${t.key === activeKey ? " active" : ""}" href="${t.href}" ${t.key === activeKey ? 'aria-current="page"' : ""}>
            ${t.icon}
            <span>${t.label}</span>
            ${t.badgeClass ? `<span class="bn-badge ${t.badgeClass}" style="display:none;">0</span>` : ""}
          </a>`).join("")}
      </nav>`;

    // Paint initial badge counts immediately — favorites.js/watchlist.js
    // are IIFEs that define AnimeHub.favorites/.watchlist synchronously at
    // parse time (no data fetch required for local counts), and this
    // script is loaded after both in every page's script order, so these
    // are already available here.
    const wlCount = AnimeHub.watchlist ? AnimeHub.watchlist.count() : 0;
    const favCount = AnimeHub.favorites ? AnimeHub.favorites.count() : 0;
    mount.querySelectorAll(".js-wl-count").forEach((el) => {
      el.textContent = wlCount;
      el.style.display = wlCount > 0 ? "grid" : "none";
    });
    mount.querySelectorAll(".js-fav-count").forEach((el) => {
      el.textContent = favCount;
      el.style.display = favCount > 0 ? "grid" : "none";
    });
  }

  document.addEventListener("DOMContentLoaded", render);
})();