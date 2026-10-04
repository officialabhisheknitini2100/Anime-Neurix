/* =========================================================
   ANIMEHUB · slider.js
   Builds + drives the homepage hero slider.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const AUTOPLAY_MS = 6500;

  function initHero() {
    const hero = document.getElementById("hero");
    if (!hero) return;

    const slidesEl = document.getElementById("hero-slides");
    const dotsEl = document.getElementById("hero-dots");
    let slides = AnimeHub.data.Rows.trendingWorldwide(6);
    if (!slides.length) slides = AnimeHub.data.getAll().slice(0, 6);
    if (!slides.length) return;

    let index = 0;
    let timer = null;

    slidesEl.innerHTML = slides
      .map((item, i) => {
        const bannerUrl = item.heroBanner || item.banner;
        // --hero-img exposes the same banner URL as a CSS custom property so
        // mobile.css can paint it as a blurred full-bleed backdrop layer
        // behind the (uncropped, object-fit:contain) foreground <img> below,
        // without duplicating the image element. Desktop ignores this
        // property entirely — it still uses the plain <img> with
        // object-fit:cover exactly as before.
        //
        // IMPORTANT: resolved to an absolute URL via new URL(...).href before
        // being embedded in the custom property. A relative path here would
        // be silently mis-resolved — browsers resolve a url() inside a CSS
        // custom property against the STYLESHEET that consumes it via var()
        // (css/mobile.css), not the page that declared the property, so a
        // relative path 404s as "css/images/banners/...". An absolute URL
        // sidesteps that entirely and works regardless of deployment path.
        const bannerUrlAbsolute = new URL(bannerUrl, document.baseURI).href;
        return `
        <div class="hero-slide${i === 0 ? " active" : ""}" data-i="${i}" style="--hero-img:url('${bannerUrlAbsolute}')">
          <img src="${bannerUrl}" alt="${AnimeHub.render.escapeHtml(item.title)} banner" loading="${i === 0 ? "eager" : "lazy"}">
          <span class="hero-shade"></span>
          <div class="hero-content">
            <span class="hero-badge">${item.category === "movie" ? "🎬 Featured Movie" : "🔥 Featured Series"}</span>
            <h1 class="hero-title">${AnimeHub.render.escapeHtml(item.title)}</h1>
            <div class="hero-meta">
              <span class="hero-rating">★ ${item.rating.toFixed(1)}</span>
              <span class="dot">${item.releaseYear}</span>
              <span class="dot">${(item.genres || []).slice(0, 3).join(" / ")}</span>
              <span class="dot">${item.category === "movie" ? item.duration : item.episodeCount + " Episodes"}</span>
            </div>
            <p class="hero-desc">${AnimeHub.render.escapeHtml(item.description)}</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="anime-details.html?id=${item.id}">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg> Watch Now
              </a>
              <button class="btn btn-ghost js-wl-btn" data-id="${item.id}">
                ${AnimeHub.watchlist && AnimeHub.watchlist.has(item.id) ? AnimeHub.render.checkIcon() : AnimeHub.render.plusIcon()}
                <span>${AnimeHub.watchlist && AnimeHub.watchlist.has(item.id) ? "In Watchlist" : "Add To Watchlist"}</span>
              </button>
            </div>
          </div>
        </div>`;
      })
      .join("");

    dotsEl.innerHTML = slides.map((_, i) => `<button data-i="${i}" class="${i === 0 ? "active" : ""}" aria-label="Slide ${i + 1}"></button>`).join("");

    function goTo(i) {
      const slideNodes = slidesEl.querySelectorAll(".hero-slide");
      const dotNodes = dotsEl.querySelectorAll("button");
      index = (i + slides.length) % slides.length;
      slideNodes.forEach((s, n) => s.classList.toggle("active", n === index));
      dotNodes.forEach((d, n) => d.classList.toggle("active", n === index));
    }
    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }
    function restart() { clearInterval(timer); timer = setInterval(next, AUTOPLAY_MS); }

    dotsEl.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      goTo(Number(btn.dataset.i));
      restart();
    });
    const nextBtn = document.getElementById("hero-next");
    const prevBtn = document.getElementById("hero-prev");
    nextBtn && nextBtn.addEventListener("click", () => { next(); restart(); });
    prevBtn && prevBtn.addEventListener("click", () => { prev(); restart(); });

    hero.addEventListener("mouseenter", () => clearInterval(timer));
    hero.addEventListener("mouseleave", restart);

    document.addEventListener("keydown", (e) => {
      if (!isInViewport(hero)) return;
      if (e.key === "ArrowRight") { next(); restart(); }
      if (e.key === "ArrowLeft") { prev(); restart(); }
    });

    function isInViewport(el) {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.6 && r.bottom > 0;
    }

    restart();
  }

  document.addEventListener("animehub:data-ready", initHero);
})();