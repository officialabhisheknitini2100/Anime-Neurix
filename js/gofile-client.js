/* =========================================================
   ANIME NEURIX · gofile-client.js
   ---------------------------------------------------------
   WHY A PROXY IS REQUIRED (read before wiring this up)
   ---------------------------------------------------------
   Gofile's officially documented content-listing endpoint
   (GET https://api.gofile.io/contents/{id}) requires an
   authenticated account token sent as an Authorization header,
   and per Gofile's own docs that endpoint is only available to
   Premium/subscribed accounts. That token must never be shipped
   inside client-side JavaScript — anyone could read it from the
   page source and use your Gofile account. Browsers also can't
   call it directly in most setups because the endpoint isn't
   opened up for arbitrary cross-origin requests.

   So this file NEVER talks to api.gofile.io directly. It only
   calls a small same-origin backend route (default:
   "/api/gofile-contents") that holds the token server-side and
   forwards a normalized response. A ready-to-deploy example of
   that backend route is included at api/gofile-contents.js.

   If you haven't deployed that proxy yet, this module simply
   reports streaming as "unavailable" and the Watch Page falls
   back to the official Gofile page / the existing Download
   system — nothing breaks, nothing is bypassed.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  AnimeHub.config = Object.assign({
    // Point this at wherever api/gofile-contents.js (or your own
    // equivalent) is deployed. Same-origin relative path by default.
    gofileProxyUrl: "/api/gofile-contents",
    gofileCacheMs: 10 * 60 * 1000, // 10 minutes
    gofileTimeoutMs: 9000,
  }, AnimeHub.config || {});

  const CACHE_PREFIX = "animehub_gofile_v1:";

  function readCache(folderId) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + folderId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.t) > AnimeHub.config.gofileCacheMs) return null;
      return parsed.v;
    } catch (e) { return null; }
  }
  function writeCache(folderId, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + folderId, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* storage full/unavailable — safe to ignore, just skip caching */ }
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /**
   * Fetch + normalize a Gofile folder's contents through the proxy.
   * Resolves to one of:
   *   { status: "ok", files: [{id,name,size,mimetype,directLink}] }
   *   { status: "empty" }
   *   { status: "not_found" }        // deleted file/folder or invalid id
   *   { status: "permission_denied" } // private folder
   *   { status: "network_error" }
   *   { status: "api_error" }
   *   { status: "not_configured" }   // no proxy deployed / no folderId
   */
  async function fetchFolder(folderId) {
    if (!folderId || !String(folderId).trim()) return { status: "not_configured" };

    const cached = readCache(folderId);
    if (cached) return cached;

    let res;
    try {
      res = await withTimeout(
        fetch(`${AnimeHub.config.gofileProxyUrl}?folderId=${encodeURIComponent(folderId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        }),
        AnimeHub.config.gofileTimeoutMs
      );
    } catch (err) {
      return { status: err && err.code === "timeout" ? "network_error" : "network_error" };
    }

    if (res.status === 404) {
      const result = { status: "not_configured" }; // proxy not deployed at this path
      return result;
    }
    if (!res.ok && res.status !== 400 && res.status !== 403) {
      return { status: "api_error" };
    }

    let data;
    try { data = await res.json(); } catch (e) { return { status: "api_error" }; }

    // Expected normalized shape from api/gofile-contents.js
    if (data && data.status === "ok") {
      const files = Array.isArray(data.files) ? data.files : [];
      const result = files.length ? { status: "ok", files } : { status: "empty" };
      writeCache(folderId, result);
      return result;
    }
    if (data && data.status === "empty") { const r = { status: "empty" }; writeCache(folderId, r); return r; }
    if (data && data.status === "not_found") return { status: "not_found" };
    if (data && data.status === "permission_denied") return { status: "permission_denied" };
    return { status: "api_error" };
  }

  /**
   * Given the file list from a Gofile folder, pick the file that
   * corresponds to a specific episode number.
   * Strategy: prefer an explicit episode number found in the filename
   * (e01, ep_1, episode 1, "- 01", etc). Falls back to natural sort
   * order (nth video file = nth episode) when no files have decodable
   * numbers, or when only one candidate remains.
   */
  function matchEpisodeFile(files, episodeNumber) {
    const videoFiles = (files || []).filter((f) => isVideoFile(f));
    if (!videoFiles.length) return null;
    if (videoFiles.length === 1) return videoFiles[0];

    const numbered = videoFiles
      .map((f) => ({ f, n: extractEpisodeNumber(f.name) }))
      .filter((x) => x.n !== null);

    if (numbered.length) {
      const exact = numbered.find((x) => x.n === Number(episodeNumber));
      if (exact) return exact.f;
    }

    const sorted = videoFiles.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const idx = Math.max(0, Math.min(sorted.length - 1, Number(episodeNumber) - 1));
    return sorted[idx] || null;
  }

  function isVideoFile(f) {
    if (f && f.mimetype && f.mimetype.indexOf("video/") === 0) return true;
    return /\.(mp4|mkv|webm|mov|m4v)$/i.test((f && f.name) || "");
  }

  function extractEpisodeNumber(name) {
    if (!name) return null;
    const m = name.match(/(?:^|[^a-z0-9])e(?:p(?:isode)?)?[\s._-]?(\d{1,3})(?!\d)/i)
      || name.match(/(?:^|[\s._-])(\d{1,3})(?:[\s._-]|$)/);
    return m ? parseInt(m[1], 10) : null;
  }

  AnimeHub.gofile = { fetchFolder, matchEpisodeFile, isVideoFile };
})();