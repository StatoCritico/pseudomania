/* Pseudomania – script del sito. Nessun cookie, nessun tracciamento.
   La sola preferenza del tema, se scelta, resta nel localStorage del browser. */
(function () {
  "use strict";
  var root = document.documentElement;
  root.classList.add("js");
  var live = document.getElementById("annuncio");
  function annuncia(testo) {
    if (!live) return;
    live.textContent = "";
    setTimeout(function () { live.textContent = testo; }, 50);
  }

  /* ---------- Tema chiaro / scuro ---------- */
  var KEY = "pseudogate-tema";
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function current() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return media && media.matches ? "dark" : "light";
  }
  var themeBtn = document.getElementById("theme-toggle");
  function renderTheme() { if (themeBtn) themeBtn.setAttribute("aria-pressed", current() === "dark" ? "true" : "false"); }
  renderTheme();
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage non disponibile */ }
      renderTheme();
    });
  }
  if (media && media.addEventListener) media.addEventListener("change", renderTheme);

  /* ---------- Pannelli a scomparsa (menu principale, indice) ---------- */
  function pannello(btnId, panelId) {
    var btn = document.getElementById(btnId), panel = document.getElementById(panelId);
    if (!btn || !panel) return;
    function set(open) { panel.classList.toggle("open", open); btn.setAttribute("aria-expanded", open ? "true" : "false"); }
    btn.addEventListener("click", function () { set(!panel.classList.contains("open")); });
    panel.addEventListener("click", function (ev) {
      if (ev.target.closest("a") && panel.classList.contains("open") && getComputedStyle(btn).display !== "none") set(false);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && panel.classList.contains("open")) { set(false); btn.focus(); }
    });
  }
  pannello("menu-toggle", "main-nav");
  pannello("tree-toggle", "docs-nav");

  /* ---------- Menu ad albero: espandi / comprimi tutto ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-tree]"), function (b) {
    b.addEventListener("click", function () {
      var open = b.getAttribute("data-tree") === "open";
      Array.prototype.forEach.call(document.querySelectorAll(".tree details"), function (d) { d.open = open; });
      annuncia(open ? "Tutti i capitoli espansi." : "Tutti i capitoli compressi.");
    });
  });

  /* ---------- Risposte espandibili: apri quella indicata nell'URL ---------- */
  function apriDaHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    var d = el.tagName === "DETAILS" ? el : el.closest("details.acc");
    if (d) {
      d.open = true;
      Array.prototype.forEach.call(document.querySelectorAll(".acc.is-target"), function (x) { x.classList.remove("is-target"); });
      d.classList.add("is-target");
      setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 0);
    }
  }
  apriDaHash();
  window.addEventListener("hashchange", apriDaHash);
  Array.prototype.forEach.call(document.querySelectorAll("[data-acc]"), function (b) {
    b.addEventListener("click", function () {
      var open = b.getAttribute("data-acc") === "open";
      Array.prototype.forEach.call(document.querySelectorAll("details.acc"), function (d) { d.open = open; });
      annuncia(open ? "Tutte le risposte aperte." : "Tutte le risposte chiuse.");
    });
  });

  /* ---------- Caroselli ----------
     Senza JS la lista scorre orizzontalmente (anche con lo swipe). Con JS si aggiungono
     pulsanti precedente/successivo, frecce della tastiera, Home/Fine e lo stato "1–3 di 6".
     Nessuna rotazione automatica. */
  var riduciMovimento = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Array.prototype.forEach.call(document.querySelectorAll(".carousel"), function (car) {
    var track = car.querySelector(".car-track");
    var slides = Array.prototype.slice.call(track.querySelectorAll(".car-slide"));
    var prev = car.querySelector(".car-prev"), next = car.querySelector(".car-next");
    var status = car.querySelector(".car-status");
    if (!track || !slides.length) return;

    function visibili() {
      var t = track.getBoundingClientRect(), primo = -1, ultimo = -1;
      slides.forEach(function (s, i) {
        var r = s.getBoundingClientRect();
        var vis = Math.min(r.right, t.right) - Math.max(r.left, t.left);
        if (vis >= r.width * 0.6) { if (primo < 0) primo = i; ultimo = i; }
      });
      if (primo < 0) { primo = 0; ultimo = 0; }
      return [primo, ultimo];
    }
    function aggiorna() {
      var v = visibili();
      var max = track.scrollWidth - track.clientWidth;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max - 2;
      if (status) status.textContent = (v[0] === v[1] ? (v[0] + 1) : (v[0] + 1) + "–" + (v[1] + 1)) + " di " + slides.length;
      return v;
    }
    function vaiA(i, focus) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      var s = slides[i];
      var left = s.offsetLeft - track.offsetLeft - 4;
      track.scrollTo({ left: left, behavior: riduciMovimento ? "auto" : "smooth" });
      if (focus) { var a = s.querySelector("a"); if (a) a.focus({ preventScroll: true }); }
    }
    function pagina(dir) {
      var v = visibili(), quante = Math.max(1, v[1] - v[0] + 1);
      var dest = dir > 0 ? Math.min(v[0] + quante, slides.length - 1) : Math.max(v[0] - quante, 0);
      vaiA(dest, false);
      setTimeout(function () {
        var nv = aggiorna();
        annuncia("Schede " + (nv[0] + 1) + "–" + (nv[1] + 1) + " di " + slides.length);
      }, riduciMovimento ? 50 : 450);
    }
    if (prev) prev.addEventListener("click", function () { pagina(-1); });
    if (next) next.addEventListener("click", function () { pagina(1); });

    track.addEventListener("keydown", function (ev) {
      var link = ev.target.closest(".car-slide a");
      if (!link) return;
      var i = slides.indexOf(link.closest(".car-slide"));
      var dest = null;
      if (ev.key === "ArrowRight") dest = i + 1;
      else if (ev.key === "ArrowLeft") dest = i - 1;
      else if (ev.key === "Home") dest = 0;
      else if (ev.key === "End") dest = slides.length - 1;
      if (dest === null || dest < 0 || dest >= slides.length) return;
      ev.preventDefault();
      var a = slides[dest].querySelector("a");
      if (a) a.focus({ preventScroll: true });
      vaiA(dest, false);
    });
    // Un link che riceve il fuoco con Tab viene portato in vista
    track.addEventListener("focusin", function (ev) {
      var s = ev.target.closest(".car-slide");
      if (!s) return;
      var t = track.getBoundingClientRect(), r = s.getBoundingClientRect();
      if (r.left < t.left || r.right > t.right) vaiA(slides.indexOf(s), false);
    });
    var timer;
    track.addEventListener("scroll", function () { clearTimeout(timer); timer = setTimeout(aggiorna, 80); }, { passive: true });
    window.addEventListener("resize", aggiorna);
    aggiorna();
  });
})();
