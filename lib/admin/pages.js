import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { escape } from "../render.js";

// Server-rendered admin pages. The dashboard needs no JavaScript beyond
// page.js (image fallbacks, pending buttons); the venue editor is driven by
// admin.js from the state embedded here. All text is French.

function computeAdminAssetVersion() {
  const deployment = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (deployment) return deployment.replace(/[^a-z0-9]/gi, "").slice(-12);
  try {
    const hash = createHash("sha256");
    for (const file of ["admin.css", "admin.js", "page.js", "shared.js"]) hash.update(readFileSync(new URL(`../../src/admin/${file}`, import.meta.url)));
    return hash.digest("hex").slice(0, 12);
  } catch {
    return Date.now().toString(36);
  }
}
export const adminAssetVersion = computeAdminAssetVersion();

const paths = {
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external: '<path d="M14 5h5v5m0-5-8 8"/><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5m0 2.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.01"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
export const icon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;

export const placeholderColors = ["#dce5d9", "#e7dcd0", "#ede4c9", "#d3e3dc", "#d8e5e8", "#e9d8cf"];
const tunisTime = new Intl.DateTimeFormat("fr-TN", { timeZone: "Africa/Tunis", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const venueTitle = (venue) => `${escape(venue.title)}${venue.subtitle ? ` <span>${escape(venue.subtitle)}</span>` : ""}`;

function adminDocument({ title, bodyClass = "", body, themeColor = "#16483c", scripts = "" }) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="same-origin"><meta name="color-scheme" content="light dark"><meta name="theme-color" media="(prefers-color-scheme: light)" content="${themeColor}"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c1a15"><title>${escape(title)} · Administration Chichkhan</title><link rel="icon" href="/assets/logo-96.png"><link rel="preload" href="/assets/fonts/body.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/display.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/assets/admin/admin.css?v=${adminAssetVersion}"><script src="/assets/admin/page.js?v=${adminAssetVersion}" defer></script>${scripts}</head><body class="admin ${bodyClass}"><a class="skip" href="#main">Aller au contenu</a>${body}</body></html>`;
}

const brandLogo = (size = 40) => `<span class="brand-logo" style="--size:${size}px"><img src="/assets/logo-96.png" alt="" width="${size}" height="${size}"></span>`;

function topBar(session) {
  return `<header class="admin-bar"><div class="admin-bar-inner"><a class="admin-brand" href="/admin">${brandLogo(38)}<span><strong>Chichkhan</strong><small>Administration des menus</small></span></a><div class="admin-bar-actions"><span class="signed-in">Connecté·e : <strong>${escape(session.username)}</strong></span>${signOutForm()}</div></div></header>`;
}
const signOutForm = (extraClass = "") => `<form method="post" action="/admin/logout" class="sign-out"><button class="btn btn-quiet ${extraClass}" type="submit" data-pending-label="Déconnexion…">Se déconnecter</button></form>`;

// ---------------------------------------------------------------------------
// Sign-in and setup

export function renderLogin({ next = "", error = "" } = {}) {
  const action = `/owner-access/password${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const invalid = error ? ' aria-invalid="true" aria-describedby="login-error"' : "";
  return adminDocument({
    title: "Connexion",
    bodyClass: "auth-body",
    body: `<main id="main" class="auth-page"><div class="auth-card">${brandLogo(64)}<p class="eyebrow">Chichkhan</p><h1>Administration des menus</h1><p class="auth-lead">Entrez votre mot de passe pour modifier les menus du Café et du Restaurant.</p>${error ? `<div class="form-alert" id="login-error" role="alert">${icon("alert")}<div><strong>Connexion impossible.</strong><p>${escape(error)}</p></div></div>` : ""}<form method="post" action="${escape(action)}" class="auth-form"><input type="hidden" name="next" value="${escape(next)}"><div class="field"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="1024" autofocus${invalid}><label class="check check-inline"><input type="checkbox" data-show-password="password"><span>Afficher le mot de passe</span></label></div><button class="btn btn-primary btn-large btn-block" type="submit" data-pending-label="Connexion…">Se connecter</button></form><p class="auth-foot">Cet espace est privé. Il n’est accessible que par votre lien personnel, et les menus publics ne créent aucun lien vers lui.</p></div></main>`,
  });
}

const settingHelp = {
  ADMIN_USERNAME: "l’identifiant de connexion de l’administrateur",
  ADMIN_PASSWORD_HASH: "le mot de passe stocké sous forme de hachage (créez-le avec npm run admin:password)",
  ADMIN_SESSION_SECRET: "une longue valeur aléatoire (au moins 32 caractères) qui protège les sessions de connexion",
};
export function renderSetup(config) {
  const missing = config.missing.map((name) => `<li><code>${escape(name)}</code> — ${escape(settingHelp[name] ?? "")}</li>`).join("");
  const problems = config.problems.map((problem) => `<li>${escape(problem)}</li>`).join("");
  return adminDocument({
    title: "Configuration requise",
    bodyClass: "auth-body",
    body: `<main id="main" class="auth-page"><div class="auth-card auth-card-wide">${brandLogo(64)}<p class="eyebrow">Administration Chichkhan</p><h1>Configuration requise</h1><p class="auth-lead">L’administration reste verrouillée tant que les réglages de connexion ne sont pas configurés sur le serveur. Personne ne peut se connecter avant cela, et les menus publics ne sont pas concernés.</p>${missing ? `<h2>Réglages manquants</h2><ul class="setup-list">${missing}</ul>` : ""}${problems ? `<h2>Réglages à corriger</h2><ul class="setup-list">${problems}</ul>` : ""}<h2>Terminer la configuration</h2><ol class="setup-steps"><li>Sur un ordinateur disposant de ce projet, lancez <code>npm run admin:password</code> et choisissez un mot de passe fort. La commande affiche une valeur pour <code>ADMIN_PASSWORD_HASH</code>.</li><li>Dans Vercel (Projet → Réglages → Variables d’environnement), ajoutez <code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD_HASH</code> et <code>ADMIN_SESSION_SECRET</code>, puis redéployez.</li><li>Pour le développement local, <code>npm run local:setup</code> écrit des valeurs locales dans <code>.env.local</code>.</li></ol></div></main>`,
  });
}

export function renderMessagePage({ title, heading, message, session, status = "error" }) {
  return adminDocument({
    title,
    bodyClass: "message-body",
    body: `${session ? topBar(session) : ""}<main id="main" class="message-page"><div class="message-card">${icon(status === "error" ? "alert" : "info", 28)}<h1>${escape(heading)}</h1><p>${escape(message)}</p><div class="button-row">${session ? `<a class="btn btn-primary" href="/admin">Retour à l’administration</a>` : ""}<a class="btn btn-secondary" href="">Réessayer</a></div></div></main>`,
  });
}

// ---------------------------------------------------------------------------
// Dashboard

function archFigure({ url, alt = "", color, className = "", focus = 50 }) {
  return `<figure class="arch ${className}${url ? " has-image" : ""}" data-image style="--photo-color:${color}">${url ? `<img src="${escape(url)}" alt="${escape(alt)}" style="object-position:50% ${Math.min(100, Math.max(0, Number(focus) || 0))}%" loading="lazy" decoding="async">` : ""}</figure>`;
}

function venueCard(summary, imageUrlFor) {
  if (summary.missing) {
    return `<article class="venue-card venue-${summary.slug}"><div class="venue-card-band"><div class="venue-card-heading"><p class="eyebrow">${summary.label}</p><h2>${summary.label}</h2></div></div><div class="venue-card-body"><p class="muted">Ce menu n’est pas encore dans la base de données. Chargez <code>db/seed.sql</code> pour le créer.</p></div></article>`;
  }
  const hero = imageUrlFor(summary.heroImageKey);
  const stats = [
    ["Catégories", summary.categories],
    ["Produits visibles", summary.visibleProducts],
    ["Produits masqués", summary.hiddenProducts],
  ];
  return `<article class="venue-card venue-${summary.slug}" aria-labelledby="venue-${summary.slug}-title"><div class="venue-card-band"><div class="venue-card-heading"><p class="eyebrow">${summary.label}</p><h2 id="venue-${summary.slug}-title" lang="fr">${venueTitle(summary)}</h2></div><div class="arch-frame">${archFigure({ url: hero, color: summary.slug === "cafe" ? "#2c6a58" : "#2b5b6e", className: "arch-hero", focus: summary.heroFocusY })}</div></div><div class="venue-card-body"><dl class="venue-stats">${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl><div class="venue-card-actions"><a class="btn btn-primary btn-large" href="/admin/${summary.slug}">Gérer le menu ${icon("arrow")}</a><a class="btn btn-quiet" href="/${summary.slug}" target="_blank" rel="noopener">Voir le menu public ${icon("external", 16)}<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a></div></div></article>`;
}

export function renderDashboard({ session, overview, imageUrlFor, databaseError = "" }) {
  const cards = overview ? overview.venues.map((summary) => venueCard(summary, imageUrlFor)).join("") : "";
  const activity = !overview ? "" : `<section class="panel-section activity" aria-labelledby="activity-title"><div class="section-heading"><h2 id="activity-title">Activité récente</h2><p>Les dernières modifications réalisées dans cette administration.</p></div>${overview.activity.length ? `<ol class="activity-list">${overview.activity.map((entry) => `<li><span class="venue-tag venue-${entry.venue}">${entry.venue === "cafe" ? "Café" : "Restaurant"}</span><p>${escape(entry.summary)}</p><small><time datetime="${entry.createdAt}">${tunisTime.format(new Date(entry.createdAt))}</time>${entry.actor ? ` · ${escape(entry.actor)}` : ""}</small></li>`).join("")}</ol>` : `<p class="empty-note">Aucune modification pour le moment. Les changements effectués ici apparaîtront avec leur heure.</p>`}</section>`;
  const unavailable = databaseError ? `<div class="form-alert" role="alert">${icon("alert")}<div><strong>La base de données des menus est indisponible.</strong><p>${escape(databaseError)} Aucune donnée de menu ne peut être affichée ou modifiée tant que la connexion ne fonctionne pas.</p></div></div>` : "";
  return adminDocument({
    title: "Vue d’ensemble",
    bodyClass: "dashboard-body",
    body: `${topBar(session)}<main id="main" class="dashboard"><div class="page-intro"><p class="eyebrow">Vue d’ensemble</p><h1>Vos menus</h1><p>Choisissez un menu. Vous pourrez y modifier tout ce que voient les clients : les photos, les noms, les catégories et les produits.</p></div>${unavailable}${cards ? `<div class="venue-cards">${cards}</div>` : ""}${activity}</main>`,
  });
}

// ---------------------------------------------------------------------------
// Venue editor shell: admin.js renders the workspace from #admin-data.

export function renderEditor({ session, venue, state }) {
  const isRestaurant = venue === "restaurant";
  const payload = JSON.stringify({ venue, username: session.username, state, colors: placeholderColors }).replace(/</g, "\\u003c");
  const title = state.venue;
  return adminDocument({
    title: `Menu ${state.venue.label}`,
    bodyClass: `editor-body venue-${venue}`,
    themeColor: isRestaurant ? "#153c4b" : "#16483c",
    scripts: `<script type="module" src="/assets/admin/admin.js?v=${adminAssetVersion}"></script>`,
    body: `<header class="editor-head"><div class="editor-top"><a class="back-link" href="/admin">${icon("back")}<span>Retour à la vue d’ensemble</span></a><nav class="venue-switch" aria-label="Choisir le menu à modifier"><a href="/admin/cafe"${venue === "cafe" ? ' aria-current="page"' : ""}>Café</a><a href="/admin/restaurant"${venue === "restaurant" ? ' aria-current="page"' : ""}>Restaurant</a></nav><div class="editor-header-actions"><a class="btn btn-on-dark" href="/${venue}" target="_blank" rel="noopener">Voir le menu public ${icon("external", 16)}<span class="sr-only"> (s’ouvre dans un nouvel onglet)</span></a>${signOutForm("btn-on-dark")}</div></div><div class="venue-band" id="venue-header"><div class="venue-band-inner"><div class="band-copy"><h1 lang="fr">${venueTitle(title)}</h1></div></div></div><p class="publish-note">${icon("info", 16)}<span>Les changements apparaissent sur le menu public ${state.venue.label} en environ une minute.</span></p></header><main id="main" class="editor" tabindex="-1"><div id="app" class="app" aria-busy="true"><p class="loading-note">Chargement du menu…</p><noscript><p class="form-alert">L’éditeur de menu nécessite JavaScript. Activez-le puis rechargez la page.</p></noscript></div></main><div class="toasts" id="toasts" role="region" aria-label="Notifications"></div><div class="sr-only live-polite" id="announcer" aria-live="polite" aria-atomic="true"></div><div class="sr-only live-assertive" id="alerter" role="alert" aria-atomic="true"></div><script type="application/json" id="admin-data">${payload}</script>`,
  });
}
