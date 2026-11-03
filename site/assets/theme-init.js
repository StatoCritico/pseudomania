/* Applica subito il tema scelto (se presente) per evitare lo sfarfallio. Nessun cookie. */
try { var t = localStorage.getItem("pseudogate-tema"); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {}
document.documentElement.classList.add("js");
