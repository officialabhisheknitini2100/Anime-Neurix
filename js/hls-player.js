/* =========================================================
   ANIME NEURIX · hls-player.js
   Adds HLS (.m3u8) playback to the existing Watch Page player.

   Scope discipline: this file only drives the existing
   #w-video / #w-player-wrap elements. Routing, data, Continue
   Watching, skip intro/outro, auto-next etc. stay exactly where
   they already live (watch-loader.js / player-extras.js).
   Plain MP4/MKV (Backblaze) and YouTube episodes never reach
   this file at all.

   Public API (called from js/watch-loader.js):
     AnimeHub.hlsPlayer.isHlsUrl(url)        -> boolean
     AnimeHub.hlsPlayer.attach({video, url, subtitles, onFatal}) -> boolean
         returns false if playback could not even start (unsupported
         browser / library missing); onFatal(message) has then already
         been called. onFatal is also called for later fatal errors.
     AnimeHub.hlsPlayer.detach()             -> tears everything down
     AnimeHub.hlsPlayer.isActive()           -> boolean
     AnimeHub.hlsPlayer.reset()              -> pause + rewind to 0:00
                                                (used instead of video.load(),
                                                which would break an MSE stream)

   Menus are built ONLY from what the stream actually offers:
     - Quality  <- hls.levels (video variants in the master playlist)
     - Audio    <- hls.audioTracks (EXT-X-MEDIA TYPE=AUDIO)
     - Subtitles<- the episode's own `subtitles` array (external WebVTT)
   Nothing is hardcoded about track order, count or indices.
   ========================================================= */
(function () {
  "use strict";
  const AnimeHub = window.AnimeHub || (window.AnimeHub = {});

  const AUDIO_PREF_KEY = "animehub:audio-lang";
  const SUB_PREF_KEY = "animehub:subtitle-lang"; // "off" or a language code
  const MAX_RECOVERY_ATTEMPTS = 2;

  /* ---------- language helpers ---------- */
  const LANG_NAMES = {
    hi: "Hindi", en: "English", zh: "Chinese", ja: "Japanese", ko: "Korean",
    es: "Spanish", fr: "French", de: "German", pt: "Portuguese", ru: "Russian",
    ar: "Arabic", id: "Indonesian", th: "Thai", vi: "Vietnamese", ta: "Tamil", te: "Telugu",
  };
  const LANG_ALIASES = {
    hin: "hi", eng: "en", zho: "zh", chi: "zh", cmn: "zh", yue: "zh", jpn: "ja", kor: "ko",
    spa: "es", fra: "fr", fre: "fr", deu: "de", ger: "de", por: "pt", rus: "ru",
    ara: "ar", ind: "id", tha: "th", vie: "vi", tam: "ta", tel: "te",
  };
  function normLang(code) {
    const c = String(code || "").toLowerCase().split(/[-_]/)[0];
    return LANG_ALIASES[c] || c;
  }
  function languageLabel(lang, fallbackName) {
    const n = normLang(lang);
    if (LANG_NAMES[n]) return LANG_NAMES[n];
    try {
      if (n && window.Intl && Intl.DisplayNames) {
        const d = new Intl.DisplayNames(["en"], { type: "language" }).of(n);
        if (d && d !== n) return d;
      }
    } catch (e) { /* fall through */ }
    return fallbackName || (lang ? String(lang) : "");
  }
  // Give every entry a unique visible label (two "English" tracks -> add their manifest name).
  function uniqueLabels(entries) {
    const counts = {};
    entries.forEach((e) => { counts[e.label] = (counts[e.label] || 0) + 1; });
    entries.forEach((e, i) => {
      if (counts[e.label] > 1) e.label = e.rawName && e.rawName !== e.label ? `${e.label} (${e.rawName})` : `${e.label} ${i + 1}`;
    });
    return entries;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked — fine */ } }

  function isHlsUrl(url) { return /\.m3u8(?:$|[?#])/i.test(String(url || "").trim()); }

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => c && n.appendChild(c));
    return n;
  }
  function svg(inner) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = inner; // static, hard-coded icon markup only
    return s;
  }
  const ICONS = {
    quality: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    audio: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
    subtitles: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h2M11 15h6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  };

  /* ---------- module state ---------- */
  let S = null;            // per-attach state (null when idle)
  let tokenCounter = 0;
  const ui = { built: false };

  /* =========================================================
     UI (built once, reused for every HLS episode)
     ========================================================= */
  function ensureUI(video) {
    if (ui.built) return;
    const wrap = document.getElementById("w-player-wrap");
    if (!wrap) return;
    ui.built = true;
    ui.wrap = wrap;
    ui.video = video;

    ui.loading = el("div", { class: "hp-loading", role: "status", "aria-live": "polite" }, [
      el("div", { class: "hp-spin" }), el("span", { class: "hp-sr", text: "Loading video" }),
    ]);
    ui.cueLayer = el("div", { class: "hp-cue-layer", "aria-hidden": "true" });
    ui.toast = el("div", { class: "hp-toast", role: "status", "aria-live": "polite" });
    ui.scrim = el("div", { class: "hp-scrim" });
    wrap.appendChild(ui.loading);
    wrap.appendChild(ui.cueLayer);
    wrap.appendChild(ui.toast);
    wrap.appendChild(ui.scrim);

    const defs = [
      { kind: "quality", title: "Quality", label: "Quality" },
      { kind: "audio", title: "Audio", label: "Audio language" },
      { kind: "subtitles", title: "Subtitles", label: "Subtitles" },
    ];
    ui.btn = {}; ui.menu = {};
    defs.forEach((d) => {
      const btn = el("button", {
        type: "button", class: "watch-fullscreen-btn hp-btn", "data-hp": d.kind,
        "aria-label": d.label, title: d.label, "aria-haspopup": "menu", "aria-expanded": "false",
      }, [svg(ICONS[d.kind])]);
      btn.hidden = true;
      const menu = el("div", { class: "hp-menu", "data-hp": d.kind, role: "menu", "aria-label": d.title, hidden: "" });
      menu.hidden = true;
      wrap.appendChild(menu);
      ui.btn[d.kind] = btn; ui.menu[d.kind] = menu;

      btn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(d.kind); });
      // Keep the global player shortcuts (space / arrows) from also firing while a control is focused.
      btn.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); openMenu(d.kind, true); }
        else if (e.key === " " || e.key === "Enter") { e.stopPropagation(); }
      });
      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        const item = e.target.closest(".hp-item");
        if (item && item.getAttribute("aria-disabled") !== "true") onSelect(d.kind, item.dataset.id);
      });
      menu.addEventListener("keydown", (e) => onMenuKey(e, d.kind));
    });

    ui.scrim.addEventListener("click", () => closeMenus(true));
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".hp-menu") && !e.target.closest(".hp-btn")) closeMenus(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && anyMenuOpen()) { e.stopPropagation(); closeMenus(true); }
    });
  }

  // Buttons live inside player-extras' control row when it exists (that row is created
  // lazily after the first episode loads); otherwise in a small standalone strip.
  function mountButtons() {
    if (!ui.built) return;
    const row = ui.wrap.querySelector(".pe-controls-row");
    const order = ["quality", "audio", "subtitles"];
    if (row) {
      if (ui.standalone && ui.standalone.parentNode) ui.standalone.remove();
      let ref = row.firstChild;
      order.forEach((k) => { if (ui.btn[k].parentNode !== row) row.insertBefore(ui.btn[k], ref); });
    } else {
      if (!ui.standalone) ui.standalone = el("div", { class: "hp-controls-standalone" });
      if (!ui.standalone.parentNode) ui.wrap.appendChild(ui.standalone);
      order.forEach((k) => { if (ui.btn[k].parentNode !== ui.standalone) ui.standalone.appendChild(ui.btn[k]); });
    }
  }

  function anyMenuOpen() { return !!ui.built && Object.keys(ui.menu).some((k) => ui.menu[k].classList.contains("open")); }

  function closeMenus(returnFocus) {
    if (!ui.built) return;
    let focusKind = null;
    Object.keys(ui.menu).forEach((k) => {
      if (ui.menu[k].classList.contains("open")) focusKind = k;
      ui.menu[k].classList.remove("open");
      ui.menu[k].hidden = true;
      ui.btn[k].setAttribute("aria-expanded", "false");
    });
    ui.scrim.classList.remove("open");
    if (returnFocus && focusKind && !ui.btn[focusKind].hidden) ui.btn[focusKind].focus();
  }

  function toggleMenu(kind) {
    if (ui.menu[kind].classList.contains("open")) closeMenus(true);
    else openMenu(kind, false);
  }

  function openMenu(kind, focusItem) {
    if (!S || ui.btn[kind].hidden) return;
    closeMenus(false);
    const speed = document.getElementById("pe-speed-menu");
    if (speed) speed.classList.remove("open");
    renderMenu(kind);
    const menu = ui.menu[kind];
    menu.hidden = false;
    menu.classList.add("open");
    ui.btn[kind].setAttribute("aria-expanded", "true");
    ui.scrim.classList.add("open");
    // Desktop: line the popover up with its button (mobile CSS turns it into a bottom sheet).
    const wr = ui.wrap.getBoundingClientRect();
    const br = ui.btn[kind].getBoundingClientRect();
    menu.style.right = Math.max(8, Math.round(wr.right - br.right)) + "px";
    ui.wrap.classList.remove("cc-hidden"); // keep the bar awake while a menu is open
    const target = menu.querySelector('.hp-item[aria-checked="true"]') || menu.querySelector(".hp-item");
    if (target && (focusItem || document.activeElement === ui.btn[kind])) target.focus();
  }

  function onMenuKey(e, kind) {
    const items = Array.prototype.slice.call(ui.menu[kind].querySelectorAll('.hp-item:not([aria-disabled="true"])'));
    const i = items.indexOf(document.activeElement);
    let handled = true;
    switch (e.key) {
      case "ArrowDown": items[(i + 1 + items.length) % items.length].focus(); break;
      case "ArrowUp": items[(i - 1 + items.length) % items.length].focus(); break;
      case "Home": items[0].focus(); break;
      case "End": items[items.length - 1].focus(); break;
      case "Escape": closeMenus(true); break;
      case "Tab": closeMenus(false); handled = false; break;
      case " ": case "Enter": handled = false; e.stopPropagation(); break; // native button click does the work
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
    else if (e.key.length === 1 || e.key.indexOf("Arrow") === 0) e.stopPropagation();
  }

  function showToast(msg) {
    if (!ui.built) return;
    ui.toast.textContent = msg;
    ui.toast.classList.add("show");
    clearTimeout(ui.toast._t);
    ui.toast._t = setTimeout(() => ui.toast.classList.remove("show"), 3200);
  }
  function showLoading(on) { if (ui.built) ui.loading.classList.toggle("show", !!on); }

  /* ---------- menu content ---------- */
  function currentItems(kind) {
    if (!S) return [];
    if (kind === "quality") {
      const items = [{ id: "auto", label: "Auto", sub: S.autoHeight ? `${S.autoHeight}p` : "", selected: S.qualityChoice === "auto" }];
      S.qualities.forEach((q, idx) => items.push({
        id: String(q.index), label: q.label, sub: idx === 0 ? "Source" : "",
        selected: S.qualityChoice === q.index,
      }));
      return items;
    }
    if (kind === "audio") {
      return S.audio.map((a) => ({ id: String(a.id), label: a.label, sub: "", selected: a.id === S.audioSelected }));
    }
    const items = [{ id: "off", label: "Off", sub: "", selected: S.subSelected === -1 }];
    S.subs.forEach((s, i) => items.push({
      id: String(i), label: s.label, sub: s.failed ? "Couldn't load" : "",
      selected: S.subSelected === i, disabled: !!s.failed,
    }));
    return items;
  }

  function renderMenu(kind) {
    const menu = ui.menu[kind];
    const title = { quality: "Quality", audio: "Audio", subtitles: "Subtitles" }[kind];
    menu.textContent = "";
    menu.appendChild(el("div", { class: "hp-menu-title", text: title, role: "presentation" }));
    currentItems(kind).forEach((it) => {
      const row = el("button", {
        type: "button", class: "hp-item", role: "menuitemradio", "data-id": it.id,
        "aria-checked": it.selected ? "true" : "false", tabindex: "-1",
      }, [
        el("span", { class: "hp-check" }, [svg(ICONS.check)]),
        el("span", { class: "hp-label", text: it.label }),
        it.sub ? el("span", { class: "hp-sub", text: it.sub }) : null,
      ]);
      if (it.disabled) row.setAttribute("aria-disabled", "true");
      menu.appendChild(row);
    });
    // roving focus: only the selected/first item is tabbable
    const first = menu.querySelector('.hp-item[aria-checked="true"]') || menu.querySelector(".hp-item");
    if (first) first.tabIndex = 0;
  }

  // Show a control only when there is a real choice to make.
  function refreshButtons() {
    if (!ui.built) return;
    mountButtons();
    const show = {
      quality: !!S && S.qualities.length >= 2,
      audio: !!S && S.audio.length >= 2,
      subtitles: !!S && S.subs.length >= 1,
    };
    Object.keys(show).forEach((k) => {
      ui.btn[k].hidden = !show[k];
      if (!show[k]) { ui.menu[k].classList.remove("open"); ui.menu[k].hidden = true; }
    });
    ui.btn.subtitles.classList.toggle("is-active", !!S && S.subSelected >= 0);
    const q = S && S.qualityChoice !== "auto" ? (S.qualities.filter((x) => x.index === S.qualityChoice)[0] || {}).label : "";
    ui.btn.quality.title = q ? `Quality: ${q}` : "Quality: Auto";
    Object.keys(ui.menu).forEach((k) => { if (ui.menu[k].classList.contains("open")) renderMenu(k); });
  }

  /* ---------- selection handlers ---------- */
  function onSelect(kind, id) {
    if (!S) return;
    if (kind === "quality") {
      if (id === "auto") { S.qualityChoice = "auto"; if (S.hls) S.hls.currentLevel = -1; }
      else { const idx = parseInt(id, 10); S.qualityChoice = idx; if (S.hls) S.hls.currentLevel = idx; }
    } else if (kind === "audio") {
      const tid = parseInt(id, 10);
      selectAudio(tid);
    } else {
      selectSubtitle(id === "off" ? -1 : parseInt(id, 10), true);
    }
    refreshButtons();
    closeMenus(true);
  }

  function selectAudio(trackId) {
    if (!S) return;
    const entry = S.audio.filter((a) => a.id === trackId)[0];
    if (!entry) return;
    if (S.mode === "hls" && S.hls) S.hls.audioTrack = trackId;
    else if (S.mode === "native" && S.video.audioTracks) {
      for (let i = 0; i < S.video.audioTracks.length; i++) S.video.audioTracks[i].enabled = (i === trackId);
    }
    S.audioSelected = trackId;
    if (entry.lang) lsSet(AUDIO_PREF_KEY, entry.lang);
  }

  /* ---------- subtitles (external WebVTT, rendered into our own cue layer) ---------- */
  function normalizeSubtitles(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((s) => {
      const url = s && typeof s === "object" ? String(s.url || "").trim() : "";
      if (!url) return;
      const lang = String(s.lang || "en").trim();
      out.push({ lang, label: String(s.label || "").trim() || languageLabel(lang, lang) || "Subtitles", url, track: null, failed: false });
    });
    return uniqueLabels(out.map((o) => Object.assign(o, { rawName: o.lang })));
  }

  function buildSubtitleTracks(video) {
    S.subs.forEach((s, i) => {
      const t = document.createElement("track");
      t.kind = "subtitles";
      t.label = s.label;
      t.srclang = normLang(s.lang) || "en";
      t.src = s.url;
      t.addEventListener("error", () => {
        if (!S || S.subs[i] !== s) return;
        s.failed = true;
        if (S.subSelected === i) { selectSubtitle(-1, false); showToast(`${s.label} subtitles couldn't be loaded.`); }
        refreshButtons();
      });
      t.addEventListener("load", () => { if (S && S.subs[i] === s) s.failed = false; });
      video.appendChild(t);
      if (t.track) t.track.mode = "disabled"; // stay off (and unfetched) until chosen
      s.track = t;
    });
  }

  function renderCues() {
    if (!ui.built) return;
    ui.cueLayer.textContent = "";
    if (!S || S.subSelected < 0) return;
    const tr = S.subs[S.subSelected] && S.subs[S.subSelected].track && S.subs[S.subSelected].track.track;
    if (!tr || !tr.activeCues) return;
    for (let i = 0; i < tr.activeCues.length; i++) {
      const cue = tr.activeCues[i];
      const line = el("div", { class: "hp-cue" });
      if (typeof cue.getCueAsHTML === "function") line.appendChild(cue.getCueAsHTML());
      else line.textContent = cue.text || "";
      ui.cueLayer.appendChild(line);
    }
  }

  // iPhone native fullscreen only shows the browser's own cue rendering, so switch to it there.
  function subtitleModeFor() { return S && S.video.webkitDisplayingFullscreen ? "showing" : "hidden"; }

  function selectSubtitle(index, remember) {
    if (!S) return;
    S.subs.forEach((s, i) => {
      const tr = s.track && s.track.track;
      if (!tr) return;
      tr.removeEventListener("cuechange", S.onCueChange);
      tr.mode = i === index ? subtitleModeFor() : "disabled";
      if (i === index) tr.addEventListener("cuechange", S.onCueChange);
    });
    S.subSelected = index;
    if (remember) lsSet(SUB_PREF_KEY, index >= 0 ? normLang(S.subs[index].lang) : "off");
    renderCues();
  }

  /* =========================================================
     Stream wiring
     ========================================================= */
  function bind(target, evt, fn, opts) {
    target.addEventListener(evt, fn, opts);
    S.listeners.push(() => target.removeEventListener(evt, fn, opts));
  }

  function newState(video, opts, token) {
    return {
      token, video, mode: null, hls: null, onFatal: opts.onFatal || function () {},
      listeners: [], failed: false, netRetries: 0, mediaRetries: 0,
      qualities: [], qualityChoice: "auto", autoHeight: 0,
      audio: [], audioSelected: -1, audioPrefApplied: false,
      subs: normalizeSubtitles(opts.subtitles), subSelected: -1,
      onCueChange: function () { renderCues(); },
    };
  }

  function buildQualities(levels) {
    // One entry per distinct height (highest-bitrate variant wins); labels come from the manifest.
    const byHeight = {};
    (levels || []).forEach((lv, index) => {
      const h = lv.height || 0;
      const key = h || "b" + (lv.bitrate || index);
      if (!byHeight[key] || (lv.bitrate || 0) > (byHeight[key].bitrate || 0)) byHeight[key] = { index, height: h, bitrate: lv.bitrate || 0 };
    });
    const list = Object.keys(byHeight).map((k) => byHeight[k]);
    list.sort((a, b) => (b.height - a.height) || (b.bitrate - a.bitrate));
    return list.map((q) => Object.assign(q, {
      label: q.height ? `${q.height}p` : (q.bitrate ? `${Math.round(q.bitrate / 1000)} kbps` : "Variant " + (q.index + 1)),
    }));
  }

  function buildAudioFromHls() {
    const tracks = (S.hls && S.hls.audioTracks) || [];
    S.audio = uniqueLabels(tracks.map((t) => ({
      id: t.id, lang: normLang(t.lang), rawName: t.name,
      label: languageLabel(t.lang, t.name) || t.name || ("Track " + (t.id + 1)),
    })));
    S.audioSelected = S.hls.audioTrack;
    // Apply the viewer's remembered language once — by language code, never by position.
    if (!S.audioPrefApplied && S.audio.length > 1) {
      S.audioPrefApplied = true;
      const pref = lsGet(AUDIO_PREF_KEY);
      const hit = pref && S.audio.filter((a) => a.lang === pref)[0];
      if (hit && hit.id !== S.audioSelected) selectAudio(hit.id);
    }
  }

  function buildAudioNative() {
    const list = S.video.audioTracks;
    S.audio = [];
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        S.audio.push({ id: i, lang: normLang(t.language), rawName: t.label, label: languageLabel(t.language, t.label) || t.label || ("Track " + (i + 1)) });
        if (t.enabled) S.audioSelected = i;
      }
      uniqueLabels(S.audio);
    }
  }

  function applyRememberedSubtitle() {
    const pref = lsGet(SUB_PREF_KEY);
    if (!pref || pref === "off") return;
    const idx = S.subs.findIndex((s) => normLang(s.lang) === pref && !s.failed);
    if (idx >= 0) selectSubtitle(idx, false);
  }

  function fail(message) {
    if (!S || S.failed) return;
    const cb = S.onFatal;
    S.failed = true;
    detach();
    try { cb(message); } catch (e) { /* loader callback must never crash the player */ }
  }

  function attach(opts) {
    detach();
    const video = opts && opts.video;
    const url = opts && String(opts.url || "").trim();
    if (!video || !url) return false;
    ensureUI(video);
    const token = ++tokenCounter;
    S = newState(video, opts, token);

    const hasHlsJs = !!(window.Hls && typeof window.Hls.isSupported === "function");
    const canHlsJs = hasHlsJs && window.Hls.isSupported();
    const canNative = !!video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (!canHlsJs && !canNative) {
      fail(hasHlsJs
        ? "This browser can't play adaptive (HLS) video. Please try a recent Chrome, Edge, Firefox or Safari."
        : "The video player component couldn't be loaded. Check your connection and reload the page.");
      return false;
    }

    showLoading(true);
    buildSubtitleTracks(video);
    bind(video, "waiting", () => showLoading(true));
    bind(video, "seeking", () => { if (video.readyState < 3) showLoading(true); });
    ["canplay", "playing", "seeked", "loadeddata"].forEach((evt) => bind(video, evt, () => showLoading(false)));
    bind(video, "webkitbeginfullscreen", () => selectSubtitle(S.subSelected, false));
    bind(video, "webkitendfullscreen", () => selectSubtitle(S.subSelected, false));

    if (canHlsJs) startHlsJs(video, url, token);
    else startNative(video, url);

    applyRememberedSubtitle();
    refreshButtons();
    return true;
  }

  function startHlsJs(video, url, token) {
    const Hls = window.Hls;
    S.mode = "hls";
    const hls = new Hls({ enableWorker: true, backBufferLength: 90 });
    S.hls = hls;

    hls.on(Hls.Events.MANIFEST_PARSED, (evt, data) => {
      if (!S || S.token !== token) return;
      S.qualities = buildQualities(hls.levels || data.levels);
      refreshButtons();
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, (evt, data) => {
      if (!S || S.token !== token) return;
      const lv = hls.levels && hls.levels[data.level];
      S.autoHeight = lv && lv.height ? lv.height : 0;
      if (ui.built && ui.menu.quality.classList.contains("open")) renderMenu("quality");
    });
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      if (!S || S.token !== token) return;
      buildAudioFromHls();
      refreshButtons();
    });
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (evt, data) => {
      if (!S || S.token !== token) return;
      S.audioSelected = data.id;
      refreshButtons();
    });
    hls.on(Hls.Events.ERROR, (evt, data) => {
      if (!S || S.token !== token || !data || !data.fatal) return;
      const D = Hls.ErrorDetails || {};
      const code = data.response && data.response.code;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        const manifestProblem = data.details === D.MANIFEST_LOAD_ERROR || data.details === D.MANIFEST_LOAD_TIMEOUT ||
          data.details === D.MANIFEST_PARSING_ERROR;
        if (manifestProblem) {
          fail(code === 404 || code === 403
            ? "This episode's stream couldn't be found."
            : "This episode's stream couldn't be loaded. Check your connection and try again.");
        } else if (S.netRetries++ < MAX_RECOVERY_ATTEMPTS) {
          hls.startLoad();
        } else {
          fail("The connection was interrupted while loading this episode. Please try again.");
        }
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        if (S.mediaRetries++ < MAX_RECOVERY_ATTEMPTS) hls.recoverMediaError();
        else fail("This episode's video couldn't be played in your browser.");
      } else {
        fail("Something went wrong while playing this episode.");
      }
    });

    hls.attachMedia(video);
    hls.loadSource(url);
  }

  function startNative(video, url) {
    S.mode = "native"; // Safari / iOS fall back: browser handles quality, we still offer audio + subtitles
    bind(video, "loadedmetadata", () => { buildAudioNative(); refreshButtons(); });
    bind(video, "error", () => fail("This episode's stream couldn't be loaded."));
    video.src = url;
    video.load();
  }

  function detach() {
    if (!S) { showLoading(false); return; }
    const old = S;
    S = null;
    old.listeners.forEach((off) => { try { off(); } catch (e) { /* ignore */ } });
    old.subs.forEach((s) => {
      if (s.track) {
        try { if (s.track.track) { s.track.track.removeEventListener("cuechange", old.onCueChange); s.track.track.mode = "disabled"; } } catch (e) { /* ignore */ }
        if (s.track.parentNode) s.track.parentNode.removeChild(s.track);
      }
    });
    if (old.hls) {
      try { old.hls.destroy(); } catch (e) { /* ignore */ }
    }
    if (old.mode === "native") { old.video.removeAttribute("src"); }
    if (ui.built) {
      closeMenus(false);
      Object.keys(ui.btn).forEach((k) => { ui.btn[k].hidden = true; ui.btn[k].classList.remove("is-active"); });
      ui.cueLayer.textContent = "";
      ui.toast.classList.remove("show");
      showLoading(false);
    }
  }

  function isActive() { return !!S && !S.failed && !!S.mode; }

  function reset() {
    if (!S) return;
    try { S.video.pause(); S.video.currentTime = 0; } catch (e) { /* ignore */ }
  }

  AnimeHub.hlsPlayer = { isHlsUrl, attach, detach, isActive, reset };
})();
