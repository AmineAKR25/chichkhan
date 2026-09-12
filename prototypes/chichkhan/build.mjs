import { menus } from "./dist/menu-data.js";
import { mkdirSync, writeFileSync } from "node:fs";
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (p) =>
  p.toLocaleString("fr-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
for (const [id, menu] of Object.entries(menus)) {
  const count = menu.categories.reduce((n, c) => n + c.items.length, 0);
  const html = `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="La carte de ${menu.name} à Djerba : catégories, spécialités et prix en dinars tunisiens."><title>Menu ${id} · ${menu.name} — Chichkhan Djerba</title><link rel="icon" href="/assets/logo.jpg"><link rel="stylesheet" href="/style.css"><script type="module" src="/menu.js"></script></head><body class="menu-page ${menu.theme}" data-menu="${id}"><a class="skip" href="#main">Aller au contenu</a><header class="site-header"><a class="brand" href="/" aria-label="Chichkhan — accueil"><img src="/assets/logo.jpg" width="48" height="48" alt=""><span>Chichkhan<small>DJERBA · DEPUIS 2002</small></span></a><nav aria-label="Nos menus"><a href="/menu-1" ${id === "1" ? 'aria-current="page"' : ""}>Restaurant <span>01</span></a><a href="/menu-2" ${id === "2" ? 'aria-current="page"' : ""}>Café <span>02</span></a></nav><a class="back-home" href="/">Les deux cartes ↗</a></header><main id="main"><section class="menu-intro"><div><p class="eyebrow">MENU 0${id} · ${menu.eyebrow}</p><h1>${menu.title}<br><em>${menu.accent}</em></h1><p>${menu.intro}</p></div><div class="menu-seal"><span>${id === "1" ? "SO" : "Chichkhan"}</span><small>${id === "1" ? "RESTAURANT LOUNGE" : "CAFÉ · DJERBA"}</small><i>${id === "1" ? "À table." : "Depuis 2002."}</i></div></section><div class="menu-workspace"><aside class="menu-sidebar"><p class="eyebrow">DANS CETTE CARTE</p><nav aria-label="Catégories" class="category-nav">${menu.categories.map((cat, i) => `<a href="#${cat.id}" ${i === 0 ? 'aria-current="location"' : ""}>${escape(cat.name)}<span>${cat.items.length}</span></a>`).join("")}</nav><p class="sidebar-note">${count} envies à découvrir.<br>Prix en dinars tunisiens.</p></aside><div class="menu-content"><div class="search-tools"><div class="search-box"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><label class="sr-only" for="search">Rechercher dans ${menu.name}</label><input id="search" type="search" placeholder="Une envie précise ? Rechercher…" autocomplete="off" aria-controls="menu-sections"><button id="clear-search" type="button" hidden aria-label="Effacer la recherche">×</button></div><span class="price-label">PRIX EN DT</span></div><p id="search-status" class="search-status" role="status" aria-live="polite"></p><div class="empty-state" id="empty-state" hidden><h2>Aucune envie ne correspond.</h2><p>Essayez « café », « Nutella » ou le nom d’un plat.</p><button type="button" id="reset-search">Revenir à toute la carte</button></div><div id="menu-sections">${menu.categories.map((cat) => `<section class="menu-section" id="${cat.id}" aria-labelledby="heading-${cat.id}"><div class="section-title"><h2 id="heading-${cat.id}" tabindex="-1">${escape(cat.name)}</h2><span>${String(cat.items.length).padStart(2, "0")} choix</span></div>${cat.note ? `<p class="section-note">${escape(cat.note)}</p>` : ""}<div class="dish-grid">${cat.items.map((item, index) => `<article class="dish" data-category="${cat.id}" data-index="${index}"><div class="dish-heading"><h3>${escape(item.name)}</h3><span class="price">${money(item.price)} <small>DT</small></span></div>${item.description ? (cat.id === "petits-dejeuners" ? `<details><summary>Voir la composition</summary><p>${escape(item.description)}</p></details>` : `<p>${escape(item.description)}</p>`) : ""}</article>`).join("")}</div></section>`).join("")}</div><div class="other-menu"><p>L’autre côté de Chichkhan.</p><a href="/menu-${id === "1" ? "2" : "1"}">Découvrir ${id === "1" ? "la carte du café" : "la carte du restaurant"} <span aria-hidden="true">↗</span></a></div></div></div></main><footer><span>Chichkhan <i>Djerba</i></span><p>Le fait maison, c’est notre signature.</p><a href="#main">Retour en haut ↑</a></footer></body></html>`;
  mkdirSync(`dist/menu-${id}`, { recursive: true });
  writeFileSync(`dist/menu-${id}/index.html`, html);
  console.log(
    `menu-${id}: ${menu.categories.length} categories, ${count} items`,
  );
}
