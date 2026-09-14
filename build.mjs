import { menus } from "./src/menu-data.js";
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./src/", import.meta.url));
const output = fileURLToPath(new URL("./dist/", import.meta.url));
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["style.css", "menu.js", "menu-data.js", "assets"])
  cpSync(`${source}${file}`, `${output}${file}`, { recursive: true });
const assetVersion = createHash("sha256")
  .update(readFileSync(`${source}/style.css`))
  .update(readFileSync(`${source}/menu.js`))
  .update(readFileSync(`${source}/menu-data.js`))
  .digest("hex").slice(0, 12);
const escape = (value) => String(value).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (price) => price.toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const colors = ["#dce5d9", "#e7dcd0", "#ede4c9", "#d3e3dc", "#d8e5e8", "#e9d8cf"];
const paths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const groupsFor = (menu) => menu.slug === "restaurant" ? [
  ["À table", menu.categories.slice(0, 6)],
  ["À boire", menu.categories.slice(6, 10)],
  ["En complément", menu.categories.slice(10)],
] : [
  ["Pour commencer", menu.categories.slice(0, 1)],
  ["À boire", menu.categories.slice(1, 10)],
  ["Les douceurs", menu.categories.slice(10, 14)],
  ["Les petites faims", menu.categories.slice(14, 19)],
  ["Chichas", menu.categories.slice(19)],
];
const navItem = (id, name, count) => `<a href="#${id === "all" ? "menu-sections" : id}" data-category="${id}"><span>${escape(name)}</span><small>${count}</small></a>`;
const navLinks = (menu, count) => `${navItem("all", "Toute la carte", count)}${groupsFor(menu).map(([label, categories]) => `<div class="nav-group"><p class="nav-group-label">${label}</p>${categories.map((cat) => navItem(cat.id, cat.name, cat.items.length)).join("")}</div>`).join("")}`;
const head = (menu) => `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="${menu.slug === "cafe" ? "#16483c" : "#153c4b"}"><meta name="description" content="${escape(menu.description)}"><title>${escape(menu.name)} — Chichkhan Djerba</title><link rel="icon" href="/assets/logo-96.png"><link rel="preload" href="/assets/fonts/body.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/display.woff2" as="font" type="font/woff2" crossorigin><script>document.documentElement.classList.add("menu-boot");setTimeout(()=>document.documentElement.classList.remove("menu-boot"),3000)</script><link rel="stylesheet" href="/style.css?v=${assetVersion}"><script type="module" src="/menu.js?v=${assetVersion}"></script>`;
const header = (menu) => `<a class="skip" href="#main">Aller au contenu</a><header class="site-header"><a class="brand" href="/${menu.slug}" aria-label="${escape(menu.name)} — haut de page"><picture><source srcset="/assets/logo-96.webp" type="image/webp"><img src="/assets/logo-96.png" width="44" height="44" alt="" decoding="async"></picture><span>${menu.slug === "cafe" ? "Chichkhan" : "SO"}<small>${menu.slug === "cafe" ? "CAFÉ" : "RESTAURANT LOUNGE"}</small></span></a></header>`;
const hero = (menu) => `<section class="hero" aria-labelledby="venue-title"><div class="hero-inner"><div class="hero-copy"><h1 id="venue-title">${menu.slug === "restaurant" ? 'SO <span>Restaurant Lounge</span>' : 'Chichkhan <span>Café</span>'}</h1></div><div class="hero-image-wrap"><figure class="hero-figure"><picture><source type="image/webp" srcset="/assets/entrance-480.webp 480w, /assets/entrance-729.webp 729w" sizes="(min-width: 1024px) 440px, 42vw"><img class="hero-photo" src="/assets/entrance-729.jpg" srcset="/assets/entrance-480.jpg 480w, /assets/entrance-729.jpg 729w" sizes="(min-width: 1024px) 440px, 42vw" width="729" height="1300" alt="${escape(menu.heroAlt)}" fetchpriority="high" decoding="async"></picture></figure></div></div></section>`;
const dish = (item, index) => `<article class="dish" data-index="${index}"><div class="dish-heading"><h3>${escape(item.name)}</h3><span class="dish-rule" aria-hidden="true"></span><span class="price">${money(item.price)} <small>DT</small></span></div>${item.description ? `<p>${escape(item.description)}</p>` : ""}</article>`;
const section = (cat, index) => `<section class="menu-section" id="${cat.id}" aria-labelledby="heading-${cat.id}"><div class="section-title"><h2 id="heading-${cat.id}" tabindex="-1">${escape(cat.name)}</h2><span>${cat.items.length} choix</span></div><div class="category-layout"><div class="category-visual"><div class="category-photo" style="--photo-color:${colors[index % colors.length]}" aria-hidden="true"></div>${cat.note ? `<p class="section-note">${escape(cat.note)}</p>` : ""}</div><div class="dish-grid">${cat.items.map((item, i) => dish(item, i)).join("")}</div></div></section>`;
const footer = (menu) => `<footer><div><a class="footer-brand" href="/${menu.slug}">${escape(menu.name)}</a></div><a class="back-to-top" href="#main">Retour en haut ${icon("up")}</a></footer>`;

for (const menu of Object.values(menus)) {
  const count = menu.categories.reduce((n, cat) => n + cat.items.length, 0);
  const links = navLinks(menu, count);
  const html = `<!doctype html><html lang="fr"><head>${head(menu)}</head><body class="menu-page ${menu.theme}" data-menu="${menu.slug}">${header(menu)}
  <main id="main">${hero(menu)}
  <section class="menu-introduction" aria-labelledby="menu-title"><div><h2 id="menu-title">La carte<span aria-hidden="true">.</span></h2></div><p>${menu.categories.length} catégories<span>Prix en dinars tunisiens <strong>DT</strong></span></p></section>
  <div class="menu-workspace"><aside class="menu-sidebar"><div class="sidebar-heading"><h2>Explorer la carte</h2><span>${menu.categories.length}</span></div><nav class="category-nav" aria-label="Catégories">${links}</nav></aside>
  <div class="menu-content"><div class="menu-tools"><button class="category-toggle" id="category-toggle" type="button" aria-haspopup="dialog" aria-controls="category-dialog" aria-expanded="false">${icon("grid")}<span><small>CATÉGORIES</small><span id="current-category">${escape(menu.categories[0].name)}</span></span>${icon("down")}</button><div class="search-tools"><label class="sr-only" for="search">Rechercher dans la carte</label><div class="search-box">${icon("search")}<input id="search" type="search" placeholder="Un plat, une boisson, un ingrédient…" autocomplete="off" aria-controls="menu-sections"><kbd aria-hidden="true">⌘ K</kbd><button id="clear-search" type="button" hidden aria-label="Effacer la recherche">${icon("close")}</button></div></div></div>
  <p id="search-status" class="search-status" role="status" aria-live="polite"></p><div class="empty-state" id="empty-state" hidden>${icon("search")}<h2>Aucun résultat.</h2><p>Essayez un autre nom ou un ingrédient. La recherche parcourt toute la carte.</p><button type="button" id="reset-search">Revenir à la carte ${icon("arrow")}</button></div>
  <div id="menu-sections">${menu.categories.map(section).join("")}</div>
  <nav class="category-pagination" id="category-pagination" aria-label="Continuer dans la carte" hidden><a id="previous-category" href="#menu-sections">${icon("back")}<span><small>Catégorie précédente</small><span></span></span></a><a id="next-category" href="#${menu.categories[0].id}"><span><small>Catégorie suivante</small><span></span></span>${icon("arrow")}</a></nav></div></div></main>${footer(menu)}
  <dialog id="category-dialog" aria-labelledby="category-dialog-title"><div class="dialog-heading"><div><p class="eyebrow">${escape(menu.name)}</p><h2 id="category-dialog-title">Les catégories</h2></div><button id="close-categories" type="button" aria-label="Fermer les catégories">${icon("close")}</button></div><div class="category-filter-wrap"><label for="category-filter" class="sr-only">Filtrer les catégories</label><div class="search-box">${icon("search")}<input type="search" id="category-filter" placeholder="Trouver une catégorie…" autocomplete="off" aria-controls="dialog-category-list"><button id="clear-category-filter" type="button" hidden aria-label="Effacer le filtre des catégories">${icon("close")}</button></div></div><p id="category-filter-status" class="sr-only" role="status"></p><nav id="dialog-category-list" class="dialog-categories" aria-label="Catégories">${links}</nav><div class="category-filter-empty" hidden><p>Aucune catégorie ne correspond.</p><button type="button" id="reset-category-filter">Afficher toutes les catégories</button></div></dialog></body></html>`;
  mkdirSync(`${output}/${menu.slug}`, { recursive: true });
  writeFileSync(`${output}/${menu.slug}/index.html`, html);
  console.log(`/${menu.slug}: ${menu.categories.length} categories, ${count} items`);
}
