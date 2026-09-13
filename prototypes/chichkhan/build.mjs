import { menus } from "./src/menu-data.js";
import { mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./src/", import.meta.url));
const output = fileURLToPath(new URL("./dist/", import.meta.url));

// dist/ is generated and git-ignored, so the build has to produce all of it:
// the static files are copied out of src/ rather than living in the output.
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of ["style.css", "menu.js", "menu-data.js", "assets"])
  cpSync(`${source}${file}`, `${output}${file}`, { recursive: true });

const assetVersion = createHash("sha256")
  .update(readFileSync(`${source}/style.css`))
  .update(readFileSync(`${source}/menu.js`))
  .update(readFileSync(`${source}/menu-data.js`))
  .digest("hex")
  .slice(0, 12);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (price) =>
  price.toLocaleString("fr-TN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const colors = [
  "#d9dfcf",
  "#d9cabb",
  "#e5d9b8",
  "#ccdbd4",
  "#c9d8df",
  "#e2ccbf",
];
// Set before first paint so the toolbar and the selected category do not pop in
// once the module runs. Without it the whole catalogue paints, then collapses.
const enhance = `<script>document.documentElement.className="js"</script>`;
const head = (title, description) =>
  `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="${escape(description)}"><title>${escape(title)} — Chichkhan Djerba</title><link rel="icon" href="/assets/logo-96.png">${enhance}<link rel="stylesheet" href="/style.css?v=${assetVersion}"><script type="module" src="/menu.js?v=${assetVersion}"></script>`;
const header = (menu) =>
  `<a class="skip" href="#main">Aller au contenu</a>
  <header class="site-header"><a class="brand" href="/${menu.slug}" aria-label="${escape(menu.name)} — haut de page"><picture><source srcset="/assets/logo-96.webp" type="image/webp"><img src="/assets/logo-96.png" width="44" height="44" alt="" decoding="async"></picture><span>Chichkhan<small>${escape(menu.brandLine)}</small></span></a></header>`;
// The supplied entrance photograph is 729px wide, so the wide band is capped to
// that and the desktop panel stays a column rather than upscaling full-bleed.
const hero = (menu, count) =>
  `<section class="hero"><figure class="hero-figure"><picture><source type="image/webp" srcset="/assets/entrance-480.webp 480w, /assets/entrance-729.webp 729w" sizes="(min-width: 1024px) 440px, 100vw"><img class="hero-photo" src="/assets/entrance-729.jpg" srcset="/assets/entrance-480.jpg 480w, /assets/entrance-729.jpg 729w" sizes="(min-width: 1024px) 440px, 100vw" width="729" height="1300" alt="${escape(menu.heroAlt)}" fetchpriority="high" decoding="async"></picture></figure>
  <div class="hero-plate"><p class="eyebrow">${escape(menu.eyebrow)}</p><h1>${escape(menu.name)}</h1></div>
  <div class="hero-sub"><p>${escape(menu.intro)}</p><span class="menu-meta">${menu.categories.length} catégories · ${count} choix · Prix en dinars tunisiens (DT)</span></div></section>`;
const footer = (menu) =>
  `<footer><a class="footer-brand" href="/${menu.slug}">Chichkhan <i>Djerba</i></a><p>Le fait maison, c’est notre signature.</p><a href="#main">Retour en haut <span aria-hidden="true">↑</span></a></footer>`;
const navLinks = (menu, count) =>
  `<a href="#menu-sections" data-category="all"><span>Toute la carte</span><small>${count}</small></a>${menu.categories.map((cat) => `<a href="#${cat.id}" data-category="${cat.id}"><span>${escape(cat.name)}</span><small>${cat.items.length}</small></a>`).join("")}`;

for (const menu of Object.values(menus)) {
  const count = menu.categories.reduce((n, cat) => n + cat.items.length, 0);
  const links = navLinks(menu, count);
  const html = `<!doctype html><html lang="fr"><head>${head(menu.name, menu.description)}</head><body class="menu-page ${menu.theme}" data-menu="${menu.slug}">${header(menu)}
  <main id="main">${hero(menu, count)}
  <div class="menu-workspace"><aside class="menu-sidebar"><p class="eyebrow">CHOISIR UNE CATÉGORIE</p><nav class="category-nav" aria-label="Catégories">${links}</nav></aside>
  <div class="menu-content"><div class="menu-tools"><button class="category-toggle" id="category-toggle" type="button" aria-haspopup="dialog" aria-controls="category-dialog" aria-expanded="false"><span><small>CATÉGORIES</small><span id="current-category">Toute la carte</span></span><span aria-hidden="true">⌄</span></button><div class="search-tools"><label for="search">Rechercher dans la carte</label><div class="search-box"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="search" type="search" placeholder="Un plat, une boisson, un ingrédient…" autocomplete="off" aria-controls="menu-sections"><button id="clear-search" type="button" hidden aria-label="Effacer la recherche">×</button></div></div></div>
  <p id="search-status" class="search-status" role="status" aria-live="polite"></p><div class="empty-state" id="empty-state" hidden><h2>Aucun résultat.</h2><p>Essayez un autre nom, une autre orthographe ou un ingrédient.</p><button type="button" id="reset-search">Effacer la recherche</button></div>
  <div id="menu-sections">${menu.categories.map((cat, catIndex) => `<section class="menu-section" id="${cat.id}" aria-labelledby="heading-${cat.id}"><div class="section-title"><h2 id="heading-${cat.id}" tabindex="-1">${escape(cat.name)}</h2><span>${cat.items.length} choix</span></div><div class="category-layout"><div class="category-visual"><div class="category-photo" style="--photo-color:${colors[catIndex % colors.length]}" aria-hidden="true"></div>${cat.note ? `<p class="section-note">${escape(cat.note)}</p>` : ""}</div><div class="dish-grid">${cat.items.map((item, index) => `<article class="dish" data-index="${index}"><div class="dish-heading"><h3>${escape(item.name)}</h3><span class="price">${money(item.price)} <small>DT</small></span></div>${item.description ? (cat.id === "petits-dejeuners" ? `<details><summary><span class="details-closed">Voir la composition</span><span class="details-open">Masquer la composition</span></summary><p>${escape(item.description)}</p></details>` : `<p>${escape(item.description)}</p>`) : ""}</article>`).join("")}</div></div></section>`).join("")}</div>
  <nav class="category-pagination" id="category-pagination" aria-label="Continuer dans la carte" hidden><a href="#menu-sections" data-category="all">Toute la carte</a><a id="next-category" href="#${menu.categories[0].id}"><small>Catégorie suivante</small><span></span><b aria-hidden="true">→</b></a></nav></div></div></main>${footer(menu)}
  <dialog id="category-dialog" aria-labelledby="category-dialog-title"><div class="dialog-heading"><div><p class="eyebrow">${escape(menu.name)}</p><h2 id="category-dialog-title">Choisir une catégorie</h2></div><button id="close-categories" type="button" aria-label="Fermer les catégories">×</button></div><nav class="dialog-categories" aria-label="Catégories">${links}</nav></dialog></body></html>`;
  mkdirSync(`${output}/${menu.slug}`, { recursive: true });
  writeFileSync(`${output}/${menu.slug}/index.html`, html);
  console.log(
    `/${menu.slug}: ${menu.categories.length} categories, ${count} items`,
  );
}
