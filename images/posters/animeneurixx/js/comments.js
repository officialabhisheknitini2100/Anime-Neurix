/* =========================================================
   ANIMEHUB · comments.js
   "Anime Community Comments" on anime-details.html.
   No login/signup/auth — just a nickname remembered in this
   browser via localStorage. Comments are stored locally too,
   so this is a personal comment journal per device rather than
   a live shared feed (there's no backend in this project).
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});
  const NICK_KEY = "animehub:nickname";
  const COMMENTS_KEY = "animehub:comments";

  function getNickname() { return localStorage.getItem(NICK_KEY) || ""; }
  function setNickname(name) {
    const clean = name.trim().slice(0, 24) || ("Guest" + Math.floor(100 + Math.random() * 900));
    localStorage.setItem(NICK_KEY, clean);
    return clean;
  }

  function readAllComments() {
    try { return JSON.parse(localStorage.getItem(COMMENTS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeAllComments(map) { localStorage.setItem(COMMENTS_KEY, JSON.stringify(map)); }

  function getComments(animeId) {
    const map = readAllComments();
    return (map[animeId] || []).slice().sort((a, b) => b.ts - a.ts);
  }
  function addComment(animeId, text) {
    const map = readAllComments();
    if (!map[animeId]) map[animeId] = [];
    map[animeId].push({ nickname: getNickname() || "Guest", text: text.trim(), ts: Date.now() });
    writeAllComments(map);
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return new Date(ts).toLocaleDateString();
  }
  function initials(name) {
    return (name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  }

  /* ---------- nickname modal (shown once, ever) ---------- */
  function ensureNicknameModal() {
    if (document.getElementById("nickname-modal")) return;
    const el = document.createElement("div");
    el.id = "nickname-modal";
    el.className = "modal-overlay";
    el.innerHTML = `
      <div class="modal-box glass gradient-border">
        <h3>Choose Your Nickname</h3>
        <p>Pick a nickname to join the discussion on any title. No account needed — this browser will remember it.</p>
        <input type="text" id="nickname-input" class="modal-input" placeholder="e.g. ShadowMonarch" maxlength="24" autocomplete="off">
        <div class="modal-actions">
          <button class="btn btn-glow" id="nickname-continue-btn" style="width:100%;">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const input = el.querySelector("#nickname-input");
    const btn = el.querySelector("#nickname-continue-btn");
    function submit() {
      const clean = setNickname(input.value);
      closeNicknameModal();
      document.dispatchEvent(new CustomEvent("animehub:nickname-set", { detail: { nickname: clean } }));
    }
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }
  function openNicknameModal(prefill) {
    ensureNicknameModal();
    const el = document.getElementById("nickname-modal");
    const input = el.querySelector("#nickname-input");
    input.value = prefill || "";
    el.classList.add("open");
    document.body.classList.add("no-scroll");
    setTimeout(() => input.focus(), 150);
  }
  function closeNicknameModal() {
    const el = document.getElementById("nickname-modal");
    if (!el) return;
    el.classList.remove("open");
    document.body.classList.remove("no-scroll");
  }

  function promptNicknameIfNeeded(onReady) {
    if (getNickname()) { onReady && onReady(); return; }
    openNicknameModal();
    document.addEventListener("animehub:nickname-set", () => onReady && onReady(), { once: true });
  }

  /* ---------- comments section (mounted on anime-details.html) ---------- */
  function renderCommentsSection(animeId) {
    const wrap = document.getElementById("comments-section");
    if (!wrap) return;

    function paintIdentity() {
      const idEl = document.getElementById("comments-identity-name");
      if (idEl) idEl.textContent = getNickname() || "Guest";
    }
    function paintList() {
      const list = document.getElementById("comment-list");
      const comments = getComments(animeId);
      if (!comments.length) {
        list.innerHTML = `<div class="state-block" style="padding:30px 10px;"><div class="state-icon">💬</div><h3>No comments yet</h3><p>Be the first to share your thoughts on this title.</p></div>`;
        return;
      }
      list.innerHTML = comments.map((c) => `
        <div class="comment-item glass">
          <div class="comment-avatar">${AnimeHub.render.escapeHtml(initials(c.nickname))}</div>
          <div class="comment-body">
            <div class="comment-meta">
              <span class="comment-name">${AnimeHub.render.escapeHtml(c.nickname)}</span>
              <span class="comment-time">${timeAgo(c.ts)}</span>
            </div>
            <div class="comment-text">${AnimeHub.render.escapeHtml(c.text)}</div>
          </div>
        </div>`).join("");
    }

    paintIdentity();
    paintList();

    const textarea = document.getElementById("comment-input");
    const postBtn = document.getElementById("comment-post-btn");
    const changeBtn = document.getElementById("change-nickname-btn");

    postBtn.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }
      promptNicknameIfNeeded(() => {
        addComment(animeId, text);
        textarea.value = "";
        paintIdentity();
        paintList();
        AnimeHub.ui && AnimeHub.ui.toast && AnimeHub.ui.toast("Comment posted");
      });
    });
    changeBtn.addEventListener("click", () => openNicknameModal(getNickname()));
    document.addEventListener("animehub:nickname-set", () => { paintIdentity(); });

    // Proactively ask once, the first time this browser ever opens a details page.
    if (!getNickname()) {
      setTimeout(() => openNicknameModal(), 900);
    }
  }

  AnimeHub.comments = { getNickname, setNickname, getComments, addComment, promptNicknameIfNeeded, openNicknameModal, renderCommentsSection };
})();
