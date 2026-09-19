import { matches, normalize } from "../src/search.js";
import { imageUrl } from "./images.js";

export const escape = (value) => String(value).replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const money = (millimes) => (millimes / 1000).toLocaleString("fr-TN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
// Dinars keep full weight; the millimes are set lighter but never removed.
const priceHtml = (millimes) => {
  const [dinars, rest] = money(millimes).split(",");
  return `${dinars}<span class="millimes">,${rest}</span>`;
};
const colors = ["#dce5d9", "#e7dcd0", "#ede4c9", "#d3e3dc", "#d8e5e8", "#e9d8cf"];
const isCompact = (category) => category.items.every((item) => !item.description);
// A failed image removes itself so the coloured placeholder behind it shows.
const fallback = `onerror="this.closest('[data-image]')?.classList.remove('has-image');this.remove()"`;
const paths = {
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2V12l3 1.9"/>',
  phone: '<path d="M6.3 3h3.1l1.5 4.9-2.1 1.5a12.4 12.4 0 0 0 5.8 5.8l1.5-2.1 4.9 1.5v3.1a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.3 5.2 2 2 0 0 1 6.3 3Z"/>',
  star: '<path d="m12 3.4 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.7l6-.8Z"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4"/><path d="M17.4 6.6h.01"/>',
  facebook: '<path d="M17.5 3H15a4.6 4.6 0 0 0-4.6 4.6V10.2H7.8v3.5h2.6V21h3.5v-7.3h2.6l.6-3.5h-3.2V7.6c0-.6.5-1.1 1.1-1.1h2.5Z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

// Category slugs become URL fragments; never let one collide with a page id.
const reserved = new Set(["main", "menu-sections", "search", "search-panel", "search-status", "search-toggle", "search-suggestions", "clear-search", "empty-state", "reset-search", "category-toggle", "category-chips", "category-dialog", "category-filter", "menu-data", "selection-bar", "selection-dialog"]);
const anchorFor = (slug) => (reserved.has(slug) || /^(heading|selection|category)-/.test(slug) ? `c-${slug}` : slug);

// Suggested search words come from this venue's own descriptions: frequent
// ingredients that are not category names and return several dishes.
const ignored = new Set(["sauce", "blanche", "fruit", "fruits", "frais", "fraiches", "choix", "infusion", "saison", "naturel", "sautes", "legumes", "boisson", "assiette", "supplement", "cerises", "tomates", "creme", "sale", "salee"]);
export function suggestionsFor(categories, limit = 6) {
  const categoryNames = categories.map((category) => normalize(category.name));
  const words = new Map();
  for (const category of categories)
    for (const item of category.items)
      for (const word of item.description.split(/[^\p{L}]+/u)) {
        const key = normalize(word);
        if (key.length < 4 || ignored.has(key) || categoryNames.some((name) => name.includes(key))) continue;
        if (!words.has(key)) words.set(key, word);
      }
  return [...words].map(([key, word]) => ({
    word: word[0].toLocaleUpperCase("fr") + word.slice(1),
    hits: categories.flatMap((category) => category.items.filter((item) => matches(item, category.name, key))).length,
  })).filter((entry) => entry.hits >= 3).sort((a, b) => b.hits - a.hits).slice(0, limit).map((entry) => entry.word);
}

const document = ({ title, description = "", theme = "#143a38", assetVersion, bodyAttributes = "", scripts = "", preconnect = "", body }) => `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="dark"><meta name="theme-color" content="${theme}">${description ? `<meta name="description" content="${escape(description)}">` : ""}<title>${escape(title)}</title>${preconnect ? `<link rel="preconnect" href="${escape(preconnect)}">` : ""}<link rel="icon" href="/assets/logo-96.png"><link rel="preload" href="/assets/fonts/body.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/display.woff2" as="font" type="font/woff2" crossorigin>${scripts}<link rel="stylesheet" href="/style.css?v=${assetVersion}"></head><body ${bodyAttributes}>${body}</body></html>`;

// The end of the menu: who this is, how to get here, and where to say what you
// thought. Every line is a venue field, so a moved address or a new account is
// an edit in the database, never a deploy. Anything left empty simply goes.
const external = (href, label, name, extra = "") =>
  `<a${extra ? ` class="${extra}"` : ""} href="${escape(href)}" target="_blank" rel="noopener">${icon(name)}<span>${escape(label)}</span></a>`;

function footerBlocks(venue) {
  const find = [
    venue.address && (venue.mapsUrl
      ? external(venue.mapsUrl, venue.address, "pin")
      : `<p>${icon("pin")}<span>${escape(venue.address)}</span></p>`),
    venue.hours && `<p>${icon("clock")}<span>${escape(venue.hours)}</span></p>`,
    // tel: needs the digits only, but the guest should read the spaced number.
    venue.phone && `<a href="tel:${escape(venue.phone.replace(/[^+\d]/g, ""))}">${icon("phone")}<span>${escape(venue.phone)}</span></a>`,
  ].filter(Boolean).join("");
  const follow = [
    venue.instagramUrl && external(venue.instagramUrl, "Instagram", "instagram"),
    venue.facebookUrl && external(venue.facebookUrl, "Facebook", "facebook"),
  ].filter(Boolean).join("");
  const review = venue.reviewUrl
    ? external(venue.reviewUrl, "Laisser un avis", "star", "review-link")
    : "";
  const column = (heading, body) => (body ? `<div class="footer-column"><h2>${heading}</h2>${body}</div>` : "");
  return `<div class="footer-top"><div class="footer-column footer-identity"><a class="footer-brand" href="/${escape(venue.slug)}">${escape(venue.name)}</a><p>Prix en dinars tunisiens (DT)</p></div>${column("Votre avis", review)}${column("Nous trouver", find)}${column("Nous suivre", follow)}</div>`;
}

export function renderMenuPage(data, { assetVersion = "dev", imageBaseUrl } = {}) {
  const { venue, groups } = data;
  const isRestaurant = venue.slug === "restaurant";
  const categories = data.categories.map((category, index) => ({
    ...category,
    anchor: anchorFor(category.slug),
    color: colors[index % colors.length],
    image: imageUrl(imageBaseUrl, category.imageKey),
  }));
  const count = categories.reduce((n, category) => n + category.items.length, 0);
  const heroImage = imageUrl(imageBaseUrl, venue.heroImageKey);
  const logoImage = imageUrl(imageBaseUrl, venue.logoImageKey);

  const hero = `<a class="skip" href="#menu-sections">Aller à la carte</a><header class="hero" aria-labelledby="venue-title"><div class="hero-inner"><div class="hero-copy"><span class="hero-logo${logoImage ? " has-image" : ""}" data-image>${logoImage ? `<img src="${escape(logoImage)}" width="68" height="92" alt="" decoding="async" ${fallback}>` : ""}</span><div class="hero-titles"><h1 id="venue-title">${escape(venue.title)}${venue.subtitle ? ` <span>${escape(venue.subtitle)}</span>` : ""}</h1>${venue.eyebrow ? `<p class="hero-meta">${escape(venue.eyebrow)}</p>` : ""}</div></div><div class="hero-image-wrap"><figure class="hero-figure${heroImage ? " has-image" : ""}" data-image>${heroImage ? `<img class="hero-photo" src="${escape(heroImage)}" alt="${escape(venue.heroImageAlt)}" style="object-position:50% ${Math.min(100, Math.max(0, venue.heroFocusY))}%" fetchpriority="high" decoding="async" ${fallback}>` : ""}</figure></div></div></header>`;

  if (!categories.length) {
    return document({
      title: venue.name, description: venue.description, assetVersion,
      bodyAttributes: `class="menu-page ${isRestaurant ? "so" : "chichkhan"}" data-menu="${escape(venue.slug)}"`,
      body: `${hero}<main id="main" class="menu-message"><h2>La carte arrive bientôt.</h2><p>Aucun article n’est publié pour le moment.</p></main>`,
    });
  }

  const navItem = (id, name, n) => `<a href="#${id === "all" ? "menu-sections" : id}" data-category="${id}"><span>${escape(name)}</span><small>${n}</small></a>`;
  const grouped = groups.map((group) => [group.name, categories.filter((category) => category.groupId === group.id)]);
  const ungrouped = categories.filter((category) => !groups.some((group) => group.id === category.groupId));
  if (ungrouped.length) grouped.push(["", ungrouped]);
  const links = `${navItem("all", "Début de la carte", count)}${grouped.filter(([, list]) => list.length).map(([label, list]) => `<div class="nav-group">${label ? `<p class="nav-group-label">${escape(label)}</p>` : ""}${list.map((category) => navItem(category.anchor, category.name, category.items.length)).join("")}</div>`).join("")}`;
  const chips = categories.map((category) => `<a class="chip" href="#${category.anchor}" data-category="${category.anchor}">${escape(category.name)}</a>`).join("");
  // A product photo, when there is one, sits in a small arch with the
  // category's placeholder colour behind it.
  const dish = (item, index, category) => {
    const photo = imageUrl(imageBaseUrl, item.imageKey);
    const thumb = photo ? `<span class="dish-photo has-image" data-image style="--photo-color:${category.color}" aria-hidden="true"><img src="${escape(photo)}" alt="" loading="lazy" decoding="async" ${fallback}></span>` : "";
    return `<article class="dish${photo ? " has-photo" : ""}" data-index="${index}" data-item-id="${item.id}">${thumb}<div class="dish-heading"><h3><span class="dish-name">${escape(item.name)}</span>${item.isHouse ? '<span class="house-mark"><span class="sr-only">, </span>Maison</span>' : ""}</h3><span class="dish-rule" aria-hidden="true"></span><span class="price">${priceHtml(item.millimes)} <small>DT</small></span></div>${item.description ? `<p>${escape(item.description)}</p>` : ""}</article>`;
  };
  const section = (category) => `<section class="menu-section" id="${category.anchor}" aria-labelledby="heading-${category.anchor}"${isCompact(category) ? " data-compact" : ""}><div class="section-title"><h2 id="heading-${category.anchor}" tabindex="-1">${escape(category.name)}</h2><span>${category.items.length} choix${isCompact(category) ? " · prix en DT" : ""}</span></div><div class="category-layout"><div class="category-visual"><div class="category-photo${category.image ? " has-image" : ""}" data-image style="--photo-color:${category.color}" aria-hidden="true">${category.image ? `<img src="${escape(category.image)}" alt="" loading="lazy" decoding="async" ${fallback}>` : ""}</div>${category.note ? `<p class="section-note">${escape(category.note)}</p>` : ""}</div><div class="dish-grid${isCompact(category) ? " is-compact" : ""}">${category.items.map((item, index) => dish(item, index, category)).join("")}</div></div></section>`;
  const suggestions = suggestionsFor(categories);
  // The browser needs names and prices for search and Ma sélection. "<" is
  // escaped so no database text can close the script element.
  const payload = JSON.stringify({
    slug: venue.slug,
    categories: categories.map((category) => ({
      id: category.anchor,
      name: category.name,
      items: category.items.map(({ id, name, description, millimes }) => ({ id, name, description, millimes })),
    })),
  }).replace(/</g, "\\u003c");

  const body = `${hero}
  <main id="main">
  <div class="menu-workspace"><aside class="menu-sidebar"><div class="sidebar-heading"><h2>Explorer la carte</h2><span>${categories.length} catégorie${categories.length === 1 ? "" : "s"}</span></div><nav class="category-nav" aria-label="Catégories">${links}</nav></aside>
  <div class="menu-content"><div class="menu-tools"><div class="category-rail"><button class="category-toggle" id="category-toggle" type="button" aria-haspopup="dialog" aria-controls="category-dialog" aria-expanded="false" aria-label="Toutes les catégories">${icon("grid")}</button><nav class="category-chips" id="category-chips" aria-label="Raccourcis vers les catégories">${chips}</nav><button class="search-toggle" id="search-toggle" type="button" aria-controls="search-panel" aria-expanded="false" aria-label="Rechercher dans la carte">${icon("search")}</button></div>
  <div class="search-tools" id="search-panel"><label class="sr-only" for="search">Rechercher dans la carte</label><div class="search-box">${icon("search")}<input id="search" type="search" placeholder="Un plat, une boisson, un ingrédient…" autocomplete="off" aria-controls="menu-sections"><kbd aria-hidden="true">⌘ K</kbd><button id="clear-search" type="button" hidden aria-label="Effacer la recherche">${icon("close")}</button></div>${suggestions.length ? `<div class="search-suggestions" id="search-suggestions"><p>Souvent recherché</p><div>${suggestions.map((word) => `<button type="button" data-suggest="${escape(word)}">${escape(word)}</button>`).join("")}</div></div>` : ""}</div></div>
  <p id="search-status" class="search-status" role="status" aria-live="polite"></p><div class="empty-state" id="empty-state" hidden>${icon("search")}<h2>Aucun résultat.</h2><p>Essayez un autre nom ou un ingrédient. La recherche parcourt toute la carte.</p><button type="button" id="reset-search">Revenir à la carte ${icon("arrow")}</button></div>
  <div id="menu-sections">${categories.map(section).join("")}</div></div></div></main>
  <footer>${footerBlocks(venue)}<a class="back-to-top" href="#main">Retour en haut ${icon("up")}</a></footer>
  <dialog id="category-dialog" aria-labelledby="category-dialog-title"><div class="dialog-heading"><div><p class="eyebrow">${escape(venue.name)}</p><h2 id="category-dialog-title">Les catégories</h2></div><button id="close-categories" type="button" aria-label="Fermer les catégories">${icon("close")}</button></div><div class="category-filter-wrap"><label for="category-filter" class="sr-only">Filtrer les catégories</label><div class="search-box">${icon("search")}<input type="search" id="category-filter" placeholder="Trouver une catégorie…" autocomplete="off" aria-controls="dialog-category-list"><button id="clear-category-filter" type="button" hidden aria-label="Effacer le filtre des catégories">${icon("close")}</button></div></div><p id="category-filter-status" class="sr-only" role="status"></p><nav id="dialog-category-list" class="dialog-categories" aria-label="Catégories">${links}</nav><div class="category-filter-empty" hidden><p>Aucune catégorie ne correspond.</p><button type="button" id="reset-category-filter">Afficher toutes les catégories</button></div></dialog>
  <div class="selection-bar" id="selection-bar" hidden><button type="button" id="open-selection" aria-haspopup="dialog" aria-controls="selection-dialog"><span><strong>Ma sélection</strong><small id="selection-count"></small></span><span class="selection-total" id="selection-bar-total"></span>${icon("arrow")}</button></div>
  <dialog id="selection-dialog" class="sheet" aria-labelledby="selection-title"><div class="dialog-heading"><div><h2 id="selection-title">Ma sélection</h2><p class="sheet-hint">Ce n’est pas une commande : montrez-la au serveur.</p></div><button id="close-selection" type="button" aria-label="Fermer ma sélection">${icon("close")}</button></div><ul class="selection-lines" id="selection-lines"></ul><div class="selection-summary"><p><span id="selection-summary-count"></span><strong id="selection-total"></strong></p><button type="button" id="clear-selection" class="text-button">Vider la sélection</button></div><p id="selection-status" class="sr-only" role="status"></p></dialog>
  <script type="application/json" id="menu-data">${payload}</script>`;

  return document({
    title: venue.name,
    description: venue.description,
    assetVersion,
    bodyAttributes: `class="menu-page ${isRestaurant ? "so" : "chichkhan"}" data-menu="${escape(venue.slug)}"`,
    // Opens the connection to R2 early: the hero photo is the largest paint.
    preconnect: heroImage || logoImage ? new URL(heroImage || logoImage).origin : "",
    scripts: `<script>document.documentElement.classList.add("menu-boot");setTimeout(()=>document.documentElement.classList.remove("menu-boot"),3000)</script><script type="module" src="/menu.js?v=${assetVersion}"></script>`,
    body,
  });
}

// Shown when the database is not configured or cannot be reached. It names
// no venue and lists no products: without the database there is no menu.
export function renderUnavailable({ assetVersion = "dev" } = {}) {
  return document({
    title: "Carte momentanément indisponible",
    assetVersion,
    bodyAttributes: 'class="status-page"',
    body: `<main id="main" class="menu-message"><h1>La carte est momentanément indisponible.</h1><p>Réessayez dans quelques instants.</p><a class="message-action" href="">Réessayer ${icon("arrow")}</a></main>`,
  });
}

export function renderNotFound({ assetVersion = "dev" } = {}) {
  return document({
    title: "Page introuvable",
    assetVersion,
    bodyAttributes: 'class="status-page"',
    body: `<main id="main" class="menu-message"><h1>Page introuvable.</h1><p>Scannez à nouveau le QR code de votre table.</p></main>`,
  });
}
