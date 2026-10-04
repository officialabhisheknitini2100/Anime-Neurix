/* =========================================================
   ANIME NEURIX · api/gofile-contents.js
   ---------------------------------------------------------
   A small server-side proxy in front of Gofile's OFFICIAL,
   documented API:
     GET  https://api.gofile.io/contents/{id}
     POST https://api.gofile.io/contents/{id}/directlinks
   These require an Authorization: Bearer <token> header tied
   to a Gofile account (content listing is a Premium account
   feature per Gofile's own docs) — so this call can only be
   made server-side, never from the browser.

   This file holds NO bypass logic of any kind: it does not
   scrape gofile.io, does not forge tokens, and does not touch
   password-protected/private folders without the folder's own
   password being supplied. If Gofile's API reports a folder as
   private, not found, or empty, this proxy reports that back
   as-is and lets the Watch Page fall back to the official
   https://gofile.io/d/<id> page or the site's existing
   Download system.

   ---------------------------------------------------------
   DEPLOYMENT
   ---------------------------------------------------------
   This file is written as a plain Node request handler
   (req, res) => {...}, which is the shape Vercel expects for
   a file placed at /api/gofile-contents.js. Adjust the export
   for your host:

     • Vercel:    keep as-is, drop this file in /api/.
     • Netlify:   wrap the handler per Netlify Functions'
                  (event, context) signature.
     • Express:   app.get('/api/gofile-contents', (req,res)=>handler(req,res))
     • Cloudflare Workers: adapt to the fetch(event) signature.

   Set the environment variable GOFILE_API_TOKEN on whatever
   platform you deploy this to. NEVER put the token in any
   client-side file (anime-data.json, gofile-client.js, etc).
   ========================================================= */

const GOFILE_API_BASE = "https://api.gofile.io";
const TOKEN = process.env.GOFILE_API_TOKEN;

// Restrict which origins may call this proxy. Set to your real
// site origin in production (e.g. "https://animeneurix.com").
const ALLOWED_ORIGIN = process.env.GOFILE_PROXY_ALLOWED_ORIGIN || "*";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ status: "api_error" }); return; }

  const folderId = (req.query && req.query.folderId) || new URL(req.url, "http://x").searchParams.get("folderId");
  if (!folderId) { res.status(400).json({ status: "not_found" }); return; }

  if (!TOKEN) {
    // Proxy is deployed but not configured — tell the client plainly
    // instead of pretending to have data.
    res.status(200).json({ status: "api_error", reason: "GOFILE_API_TOKEN is not set on the server." });
    return;
  }

  try {
    const contentRes = await fetch(`${GOFILE_API_BASE}/contents/${encodeURIComponent(folderId)}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
    });

    if (contentRes.status === 404) { res.status(200).json({ status: "not_found" }); return; }
    if (contentRes.status === 401 || contentRes.status === 403) { res.status(200).json({ status: "permission_denied" }); return; }
    if (!contentRes.ok) { res.status(200).json({ status: "api_error" }); return; }

    const payload = await contentRes.json();

    if (!payload || payload.status !== "ok" || !payload.data) {
      const reason = payload && payload.status;
      if (reason === "error-notFound") { res.status(200).json({ status: "not_found" }); return; }
      if (reason === "error-permissionDenied" || reason === "error-unauthorized") { res.status(200).json({ status: "permission_denied" }); return; }
      res.status(200).json({ status: "api_error" });
      return;
    }

    const node = payload.data;
    if (node.type !== "folder") { res.status(200).json({ status: "not_found" }); return; }

    const children = node.children ? Object.values(node.children) : [];
    const videoChildren = children.filter((c) => c.type === "file" && isVideo(c));

    if (!videoChildren.length) { res.status(200).json({ status: "empty" }); return; }

    // Ensure every video file has a direct link, creating one via the
    // official directlinks endpoint when it's missing.
    const files = await Promise.all(videoChildren.map(async (c) => {
      let directLink = firstDirectLink(c);
      if (!directLink) {
        directLink = await createDirectLink(c.id);
      }
      return { id: c.id, name: c.name, size: c.size, mimetype: c.mimetype, directLink };
    }));

    const usable = files.filter((f) => f.directLink);
    if (!usable.length) { res.status(200).json({ status: "empty" }); return; }

    res.status(200).json({ status: "ok", files: usable });
  } catch (err) {
    res.status(200).json({ status: "network_error" });
  }
};

function isVideo(child) {
  if (child.mimetype && child.mimetype.indexOf("video/") === 0) return true;
  return /\.(mp4|mkv|webm|mov|m4v)$/i.test(child.name || "");
}

function firstDirectLink(child) {
  if (!child.directLinks) return null;
  const links = Object.values(child.directLinks);
  return links.length ? links[0].directLink || links[0].link : null;
}

async function createDirectLink(contentId) {
  try {
    const res = await fetch(`${GOFILE_API_BASE}/contents/${encodeURIComponent(contentId)}/directlinks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!payload || payload.status !== "ok" || !payload.data) return null;
    return payload.data.directLink || payload.data.link || null;
  } catch (e) {
    return null;
  }
}
