/* =========================================================
   ANIMEHUB · intro.js
   4-second cinematic intro shown once per browser tab session
   on index.html. Handles:
   - sessionStorage gating (see the inline script in index.html
     for the synchronous "already shown" fast-path that avoids
     any flash on repeat visits within the same session)
   - a single autoplay attempt with the video's original audio
     (never force-muted). If the browser's autoplay-with-audio
     policy blocks it (NotAllowedError), the intro is dismissed
     immediately — no muted fallback, no "tap for sound" UI, and
     no waiting on a black screen for the timer.
   - a hard safety timeout so it can never get stuck
   - a Skip button
   ========================================================= */
(function () {
  "use strict";
  const SESSION_KEY = "animehub:intro-shown";
  const MAX_MS = 4300;      // ~4s as requested; the source clip runs ~4.6s so this reads as "about 4 seconds" without waiting for a hard-coded duration that may not match the file
  const SAFETY_MS = 7000;   // absolute upper bound — covers a stalled/slow-loading video so the overlay can never get stuck open

  const overlay = document.getElementById("intro-overlay");
  if (!overlay) return; // not on this page

  // The inline script in <head>/<body> already hid the overlay synchronously
  // if this session already saw the intro — respect that and do nothing.
  if (overlay.style.display === "none") return;

  let alreadyShown = false;
  try { alreadyShown = !!sessionStorage.getItem(SESSION_KEY); } catch (e) { /* privacy mode — treat as not shown, just won't persist */ }
  if (alreadyShown) { overlay.style.display = "none"; return; }

  const video = document.getElementById("intro-video");
  const skipBtn = document.getElementById("intro-skip-btn");
  if (!video) { dismiss(); return; }

  let dismissed = false;
  let safetyTimer = null;
  let maxTimer = null;

  function markShown() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (e) { /* ignore — worst case the intro can replay once more this "session" */ }
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    markShown();
    clearTimeout(safetyTimer);
    clearTimeout(maxTimer);
    overlay.classList.add("intro-fading");
    const finish = () => {
      overlay.style.display = "none";
      try { video.pause(); } catch (e) {}
      video.removeAttribute("src");
      video.load();
    };
    // Fade out smoothly, but never rely solely on the transitionend event —
    // browsers can drop it (e.g. tab backgrounded), so back it with a timer.
    overlay.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 500);
  }

  skipBtn && skipBtn.addEventListener("click", dismiss);

  video.addEventListener("ended", dismiss);
  video.addEventListener("error", dismiss); // bad/missing file — never let a broken video block the site

  maxTimer = setTimeout(dismiss, MAX_MS);
  safetyTimer = setTimeout(dismiss, SAFETY_MS);

  function attemptPlayback() {
    // Never touch video.muted — it starts unmuted (the element's default),
    // so this always attempts real audio playback. If the browser blocks
    // autoplay with sound (confirmed via NotAllowedError testing — Chrome's
    // "user hasn't interacted with the document yet" policy), playback
    // never starts. There is no muted retry and no UI: per spec, we just
    // dismiss the intro immediately so the site is never left sitting on
    // a black screen waiting for the timer.
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => { dismiss(); }); // autoplay-with-audio blocked — skip straight to the site, no fallback playback
    }
  }

  if (video.readyState >= 2) attemptPlayback();
  else {
    video.addEventListener("canplay", attemptPlayback, { once: true });
    // If the video never becomes playable at all (network failure etc.),
    // the SAFETY_MS timer above still guarantees dismissal.
  }
})();