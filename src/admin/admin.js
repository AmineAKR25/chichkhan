// The venue editor at /admin/cafe and /admin/restaurant. Every change goes
// through the authenticated /api/admin endpoint, which returns the venue's
// fresh state; the page re-renders from it. Nothing is autosaved: text
// edits wait for "Save changes", and every deletion is confirmed first.
const version = new URL(import.meta.url).search;
const {
  IMAGE_TYPES, LIMITS, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, PHOTO_SHAPES,
  formatPrice, hasErrors, parsePrice, priceInputValue, slugify,
  validateCategory, validateGroup, validateProduct, validateVenueDetails,
} = await import(`./shared.js${version}`);
const { normalize } = await import(`/search.js${version}`);

const boot = JSON.parse(document.getElementById('admin-data').textContent);
const venue = boot.venue;
const colors = boot.colors;
let state = boot.state;
const venueLabel = state.venue.label;
const app = document.getElementById('app');
const header = document.getElementById('venue-header');

// ---------------------------------------------------------------------------
// Small helpers

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoted = (name) => `“${name}”`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
// The kept original only has to be good enough to crop from again.
const ORIGINAL_MAX_SIDE = 1800;
let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;
const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5m0 2.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.01"/>',
  up: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  down: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  crop: '<path d="M6.5 2v15.5H22"/><path d="M2 6.5h15.5V22"/>',
};
const icon = (name, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
const fragment = (html) => document.createRange().createContextualFragment(html);

const categoryById = (id) => state.categories.find((category) => category.id === id);
const productById = (id) => state.products.find((product) => product.id === id);
const groupById = (id) => state.groups.find((group) => group.id === id);
const productsOf = (categoryId) => state.products.filter((product) => product.categoryId === categoryId).sort((a, b) => a.position - b.position);
const colorFor = (categoryId) => colors[Math.max(0, state.categories.findIndex((category) => category.id === categoryId)) % colors.length];
const siblingsOf = (category) => state.categories.filter((other) => (other.groupId ?? null) === (category.groupId ?? null));
function sections() {
  const grouped = state.groups.map((group) => ({ group, categories: state.categories.filter((c) => c.groupId === group.id) }));
  const loose = state.categories.filter((c) => c.groupId === null || !groupById(c.groupId));
  return loose.length ? [...grouped, { group: null, categories: loose }] : grouped;
}

// Public menu price: "12,500 DT" with lighter millimes, as guests see it.
function publicPrice(millimes) {
  const dinars = Math.floor(millimes / 1000).toLocaleString('fr-TN');
  return `${esc(dinars)}<span class="millimes">,${String(millimes % 1000).padStart(3, '0')}</span> <small>DT</small>`;
}

// A photo you change by tapping it: the photo itself plus a written label.
function photoButton({ target, id, url, color, label, name, focusKey, className = '' }) {
  return `<button type="button" class="photo-button ${className}" data-action="photo" data-target="${target}" data-id="${id}" data-focus-key="${focusKey}"><span class="arch${url ? ' has-image' : ''}" data-image style="--photo-color:${esc(color)}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : ''}</span><span class="photo-button-label">${label}<span class="sr-only"> de ${esc(name)}</span></span></button>`;
}

function arch(url, color, extra = '', alt = '') {
  return `<figure class="arch ${extra}${url ? ' has-image' : ''}" data-image style="--photo-color:${esc(color)}"${alt ? '' : ' aria-hidden="true"'}>${url ? `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : ''}</figure>`;
}

// ---------------------------------------------------------------------------
// Announcements and toasts. Modal dialogs make the rest of the page inert,
// so both live inside the topmost open dialog when there is one.

const topDialog = () => [...document.querySelectorAll('dialog[open]')].at(-1) ?? null;

function liveRegion(assertive) {
  const host = topDialog() ?? document.body;
  const className = assertive ? 'live-assertive' : 'live-polite';
  let region = host.querySelector(`:scope > .${className}`);
  if (!region) {
    region = document.createElement('div');
    region.className = `sr-only ${className}`;
    if (assertive) region.setAttribute('role', 'alert');
    else region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    host.append(region);
  }
  return region;
}
function announce(message, { assertive = false } = {}) {
  const region = liveRegion(assertive);
  region.textContent = '';
  setTimeout(() => { region.textContent = message; }, 60);
}

function toastRegion() {
  const host = topDialog() ?? document.body;
  let region = host.querySelector(':scope > .toasts');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toasts';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Notifications');
    // Over a dialog, notifications sit at the top, clear of its buttons.
    if (host !== document.body) region.classList.add('in-dialog');
    host.append(region);
  }
  return region;
}
// When a dialog closes, its notifications move back to the page.
function adoptToasts(dialog) {
  const moved = dialog.querySelector(':scope > .toasts');
  if (!moved) return;
  const region = document.getElementById('toasts');
  for (const toastElement of [...moved.children]) region.append(toastElement);
}

function toast(message, { type = 'success', detail = '', action = null, duration } = {}) {
  const region = toastRegion();
  const element = document.createElement('div');
  element.className = `toast toast-${type}`;
  const actionHtml = action
    ? `<div class="toast-actions">${action.href
      ? `<a class="btn btn-secondary btn-small" href="${esc(action.href)}"${action.newTab ? ' target="_blank" rel="noopener"' : ''}>${esc(action.label)}</a>`
      : `<button type="button" class="btn btn-secondary btn-small" data-toast-action>${esc(action.label)}</button>`}</div>`
    : '';
  element.innerHTML = `${icon(type === 'success' ? 'check' : type === 'warning' ? 'info' : 'alert')}<div><p>${esc(message)}</p>${detail ? `<p>${esc(detail)}</p>` : ''}</div><button type="button" class="toast-close">Fermer<span class="sr-only"> la notification</span></button>${actionHtml}`;
  // At most three at a time, so notifications never bury the page.
  while (region.children.length >= 3) region.firstElementChild.remove();
  region.append(element);
  announce(`${message}${detail ? ` ${detail}` : ''}${action && !action.href ? ` ${action.label} est disponible dans la notification.` : ''}`, { assertive: type === 'error' });

  let remaining = duration ?? (action ? 20000 : type === 'error' ? 14000 : type === 'warning' ? 10000 : 6500);
  let started = Date.now();
  let timer = setTimeout(dismiss, remaining);
  function dismiss() {
    clearTimeout(timer);
    element.remove();
  }
  const pause = () => { clearTimeout(timer); remaining -= Date.now() - started; };
  const resume = () => { started = Date.now(); clearTimeout(timer); timer = setTimeout(dismiss, Math.max(remaining, 4000)); };
  element.addEventListener('mouseenter', pause);
  element.addEventListener('mouseleave', resume);
  element.addEventListener('focusin', pause);
  element.addEventListener('focusout', resume);
  element.querySelector('.toast-close').addEventListener('click', dismiss);
  element.querySelector('[data-toast-action]')?.addEventListener('click', async (event) => {
    const done = await action.onClick(event.currentTarget);
    if (done !== false) dismiss();
  });
  return { dismiss };
}

// ---------------------------------------------------------------------------
// Server calls

class ApiError extends Error {
  constructor(message, { status = 0, fields, code } = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

async function request(url, init) {
  let response;
  try {
    response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez la connexion internet puis réessayez.');
  }
  let data = null;
  try {
    data = await response.json();
  } catch { /* not JSON: handled below */ }
  if (!response.ok || !data?.ok) {
    const fallback = response.status === 413 ? 'Cette photo est trop volumineuse. Choisissez-en une de moins de 4 Mo.' : `Le serveur n’a pas pu terminer cette action (erreur ${response.status}).`;
    throw new ApiError(data?.error?.message ?? fallback, { status: response.status, fields: data?.error?.fields, code: data?.error?.code });
  }
  return data;
}
const apiGet = (op, query = {}) => request(`/api/admin?${new URLSearchParams({ op, ...query })}`, { headers: { Accept: 'application/json' } });
const apiPost = (op, body) => request(`/api/admin?${new URLSearchParams({ op })}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Chichkhan-Admin': '1' },
  body: JSON.stringify({ venue, ...body }),
});

function reportError(error, { prefix = '' } = {}) {
  if (error.status === 401 || error.code === 'signed-out') {
    toast('Votre session a expiré. Rouvrez votre lien privé dans un nouvel onglet pour vous reconnecter, puis recommencez la dernière étape.', {
      type: 'error',
      duration: 60000,
    });
    return;
  }
  toast(prefix || error.message, { type: 'error', detail: prefix ? error.message : '' });
  // The record changed underneath: show the latest version.
  if (error.status === 404 || error.status === 409 || error.status === 410) refreshState();
}

async function refreshState() {
  try {
    state = (await apiGet('state', { venue })).state;
    render();
  } catch { /* the error was already reported */ }
}

// ---------------------------------------------------------------------------
// View state, kept in the URL so reloads, links and Back all work.

let view = readView();
function readView() {
  const params = new URLSearchParams(location.search);
  const screen = ['structure', 'activity'].includes(params.get('view')) ? params.get('view') : 'products';
  const category = params.get('category');
  return {
    screen,
    all: category === 'all',
    categoryId: Number(category) || null,
    q: params.get('q') ?? '',
    visibility: ['visible', 'hidden'].includes(params.get('visibility')) ? params.get('visibility') : 'all',
  };
}
function viewUrl(next = view) {
  const params = new URLSearchParams();
  if (next.screen !== 'products') params.set('view', next.screen);
  else {
    if (next.all) params.set('category', 'all');
    else if (next.categoryId) params.set('category', next.categoryId);
    if (next.q.trim()) params.set('q', next.q.trim());
    if (next.visibility !== 'all') params.set('visibility', next.visibility);
  }
  const search = params.toString();
  return `${location.pathname}${search ? `?${search}` : ''}`;
}
const filtersActive = () => Boolean(view.q.trim()) || view.visibility !== 'all';
// Search covers the whole menu, like the public search. The category being
// read is remembered and shown again once the search is cleared.
let searchOrigin = null;
function searchChanges(value) {
  const starting = value.trim() && !view.q.trim();
  if (starting && view.categoryId) {
    searchOrigin = view.categoryId;
    return { q: value, categoryId: null, all: false };
  }
  if (!value.trim() && searchOrigin && view.visibility === 'all' && !view.categoryId) {
    const categoryId = searchOrigin;
    searchOrigin = null;
    return { q: '', categoryId, all: false };
  }
  return { q: value };
}
function clearFilters() {
  document.getElementById('filter-q').value = '';
  const categoryId = view.categoryId ?? searchOrigin;
  searchOrigin = null;
  setView({ q: '', visibility: 'all', categoryId, all: !categoryId && view.all });
}
const categoryView = (categoryId) => ({ screen: 'products', all: false, categoryId, q: '', visibility: 'all' });
function setView(changes, { push = true, focus = 'heading' } = {}) {
  view = { ...view, ...changes };
  normalizeView();
  const url = viewUrl();
  if (url !== `${location.pathname}${location.search}${location.hash}`) history[push ? 'pushState' : 'replaceState'](null, '', url);
  render({ focus });
}
function normalizeView() {
  if (view.screen !== 'products') return;
  if (view.categoryId && !categoryById(view.categoryId)) view.categoryId = null;
  if (!view.categoryId && !view.all && !filtersActive() && state.categories.length) view.categoryId = state.categories[0].id;
}
window.addEventListener('popstate', () => {
  view = readView();
  normalizeView();
  render({ focus: 'heading' });
});

// ---------------------------------------------------------------------------
// Layout

function renderFrame() {
  app.innerHTML = `<div class="editor-layout">
    <aside class="editor-sidebar" aria-label="Sections du menu"><div class="sidebar-card"><button type="button" class="btn btn-primary btn-block" data-action="category-new">${icon('plus')} Ajouter une catégorie</button><nav class="side-nav" id="side-nav" aria-label="Catégories"></nav></div></aside>
    <div class="editor-main">
      <div class="picker"><div class="field"><label for="picker-select">Afficher</label><select id="picker-select"></select></div><div class="button-row"><button type="button" class="btn btn-secondary" data-action="category-new">${icon('plus')} Ajouter une catégorie</button><button type="button" class="btn btn-secondary" data-action="product-new">${icon('plus')} Ajouter un produit</button></div></div>
      <div class="filters" id="filters" role="search" aria-label="Rechercher des produits">
        <div class="field search-field"><label for="filter-q">Rechercher des produits</label><div class="search-input">${icon('search')}<input type="search" id="filter-q" placeholder="Nom ou description" autocomplete="off" spellcheck="false" maxlength="80"></div></div>
        <div class="field"><label for="filter-visibility">Visibilité</label><select id="filter-visibility"><option value="all">Tous</option><option value="visible">Visibles uniquement</option><option value="hidden">Masqués uniquement</option></select></div>
        <div class="field category-filter"><label for="filter-category">Catégorie</label><select id="filter-category"></select></div>
        <div class="filter-summary" id="filter-summary" hidden><span id="filter-count" role="status"></span><button type="button" class="btn btn-secondary btn-small" data-action="filters-clear">Effacer la recherche et les filtres</button></div>
      </div>
      <div id="content" class="content"></div>
    </div>
  </div>`;

  const search = document.getElementById('filter-q');
  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => setView(searchChanges(search.value), { push: false, focus: null }), 200);
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && search.value) {
      search.value = '';
      setView(searchChanges(''), { push: false, focus: null });
    }
  });
  document.getElementById('filter-visibility').addEventListener('change', (event) => setView({ visibility: event.target.value }, { focus: null }));
  document.getElementById('filter-category').addEventListener('change', (event) => {
    const value = event.target.value;
    setView(value === 'all' ? { all: true, categoryId: null } : { all: false, categoryId: Number(value) }, { focus: null });
  });
  document.getElementById('picker-select').addEventListener('change', (event) => {
    const value = event.target.value;
    if (value === 'structure' || value === 'activity') setView({ screen: value });
    else if (value === 'all') setView({ screen: 'products', all: true, categoryId: null });
    else setView(categoryView(Number(value)));
  });
}

function categoryOptions(selectedId, { includeAll = false, exclude = null } = {}) {
  const option = (category) => `<option value="${category.id}"${category.id === selectedId ? ' selected' : ''}>${esc(category.name)}${category.isVisible ? '' : ' (masquée)'}</option>`;
  const groups = sections().map(({ group, categories }) => {
    const list = categories.filter((category) => category.id !== exclude);
    return list.length ? `<optgroup label="${esc(group ? group.name : 'Sans groupe')}">${list.map(option).join('')}</optgroup>` : '';
  }).join('');
  return `${includeAll ? `<option value="all"${selectedId === null ? ' selected' : ''}>Toutes les catégories</option>` : ''}${groups}`;
}

function renderNav() {
  const inCategory = view.screen === 'products' && !filtersActive() && view.categoryId;
  const current = (condition) => (condition ? ' aria-current="page"' : '');
  const link = (screen, label, count = '') => `<a href="${esc(viewUrl({ ...view, screen }))}" data-nav="${screen}"${current(view.screen === screen)}><span>${label}</span>${count}</a>`;
  document.getElementById('side-nav').innerHTML = `<div class="side-tools">${link('structure', 'Groupes et ordre')}${link('activity', 'Activité')}<a href="${esc(viewUrl({ ...categoryView(null), all: true }))}" data-nav="all"${current(view.screen === 'products' && view.all && !filtersActive())}><span>Tous les produits</span><small>${state.products.length}</small></a></div>${sections().map(({ group, categories }) => `<div class="side-group"><p class="side-group-label"${group ? ' lang="fr"' : ''}>${esc(group ? group.name : 'Sans groupe')}</p>${categories.map((category) => {
    const count = productsOf(category.id).length;
    return `<a href="${esc(viewUrl(categoryView(category.id)))}" data-nav="category" data-id="${category.id}"${current(inCategory === category.id)}${category.isVisible ? '' : ' class="is-hidden-item"'}><span lang="fr">${esc(category.name)}</span><small>${count}${category.isVisible ? '' : ' · masquée'}<span class="sr-only"> ${count === 1 ? 'produit' : 'produits'}${category.isVisible ? '' : ', catégorie masquée'}</span></small></a>`;
  }).join('')}${categories.length ? '' : '<p class="hint side-empty">Aucune catégorie pour le moment.</p>'}</div>`).join('')}`;

  const picker = document.getElementById('picker-select');
  const selected = view.screen !== 'products' ? view.screen : view.all || !view.categoryId ? 'all' : String(view.categoryId);
  picker.innerHTML = `<option value="structure">Groupes et ordre</option><option value="activity">Activité</option><option value="all">Tous les produits (${state.products.length})</option>${sections().map(({ group, categories }) => categories.length ? `<optgroup label="${esc(group ? group.name : 'Sans groupe')}">${categories.map((category) => `<option value="${category.id}">${esc(category.name)} (${productsOf(category.id).length})${category.isVisible ? '' : ' – masquée'}</option>`).join('')}</optgroup>` : '').join('')}`;
  picker.value = selected;
}

function syncFilters() {
  const filters = document.getElementById('filters');
  filters.hidden = view.screen !== 'products' || !state.categories.length;
  const search = document.getElementById('filter-q');
  if (document.activeElement !== search && search.value !== view.q) search.value = view.q;
  document.getElementById('filter-visibility').value = view.visibility;
  const category = document.getElementById('filter-category');
  category.innerHTML = categoryOptions(view.categoryId, { includeAll: true });
  category.value = view.categoryId ? String(view.categoryId) : 'all';
  const summary = document.getElementById('filter-summary');
  summary.hidden = !filtersActive();
  if (filtersActive()) document.getElementById('filter-count').textContent = `${plural(filteredProducts().length, 'produit')} trouvé${filteredProducts().length > 1 ? 's' : ''}`;
}

function filteredProducts() {
  const words = normalize(view.q.trim()).split(/\s+/).filter(Boolean);
  return state.categories
    .filter((category) => !view.categoryId || category.id === view.categoryId)
    .flatMap((category) => productsOf(category.id))
    .filter((product) => {
      if (view.visibility === 'visible' && !product.isVisible) return false;
      if (view.visibility === 'hidden' && product.isVisible) return false;
      const text = normalize(`${product.name} ${product.description}`);
      return words.every((word) => text.includes(word));
    });
}

// ---------------------------------------------------------------------------
// Content

function productRow(product, { index = 0, count = 1, orderable = true, showCategory = false } = {}) {
  const name = `<span class="sr-only"> ${esc(product.name)}</span>`;
  const key = `product-${product.id}`;
  const category = categoryById(product.categoryId);
  return `<li class="product-row${product.isVisible ? '' : ' is-hidden'}${orderable ? '' : ' no-order'}" data-row="${key}">
    ${orderable ? `<span class="row-number"><span class="sr-only">Position </span>${index + 1}</span>` : ''}
    ${photoButton({ target: 'product', id: product.id, url: product.imageUrl, color: colorFor(product.categoryId), label: 'Photo', name: product.name, focusKey: `${key}-photo`, className: 'thumb-button' })}
    <div class="product-main"><div class="product-title"><span class="product-name" lang="fr">${esc(product.name)}</span>${product.isHouse ? '<span class="badge badge-house">Maison</span>' : ''}${product.isVisible ? '' : '<span class="badge badge-hidden">Masqué</span>'}<span class="product-price">${formatPrice(product.millimes)}</span></div>${product.description ? `<p class="product-desc" lang="fr">${esc(product.description)}</p>` : ''}${showCategory && category ? `<p class="product-where">Dans <a href="${esc(viewUrl(categoryView(category.id)))}" data-nav="category" data-id="${category.id}" lang="fr">${esc(category.name)}</a></p>` : ''}</div>
    <div class="row-actions">
      <button type="button" class="btn btn-secondary btn-small" data-action="product-edit" data-id="${product.id}" data-focus-key="${key}-edit">Modifier${name}</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="product-visibility" data-id="${product.id}" data-visible="${!product.isVisible}" data-focus-key="${key}-visibility">${product.isVisible ? 'Masquer' : 'Afficher'}${name}</button>
      ${orderable ? `<button type="button" class="btn btn-secondary btn-small" data-action="product-move" data-id="${product.id}" data-direction="up" data-focus-key="${key}-up"${index === 0 ? ' disabled' : ''}>${icon('up', 16)} Monter${name}</button><button type="button" class="btn btn-secondary btn-small" data-action="product-move" data-id="${product.id}" data-direction="down" data-focus-key="${key}-down"${index === count - 1 ? ' disabled' : ''}>${icon('down', 16)} Descendre${name}</button>` : ''}
    </div>
  </li>`;
}

function renderCategory(category) {
  const products = productsOf(category.id);
  const hidden = products.filter((product) => !product.isVisible).length;
  const siblings = siblingsOf(category);
  const index = siblings.findIndex((other) => other.id === category.id);
  const group = groupById(category.groupId);
  const warning = !category.isVisible
    ? 'Cette catégorie est masquée. Les clients ne la voient pas, ni aucun de ses produits.'
    : products.length && !products.some((product) => product.isVisible) ? 'Tous ses produits sont masqués ; les clients ne voient donc pas cette catégorie.' : '';
  return `<section class="category-panel" aria-labelledby="category-title">
    <div class="category-head">
      <div>
        <p class="eyebrow">${group ? `<span lang="fr">${esc(group.name)}</span>` : 'Sans groupe'} · Catégorie ${index + 1} sur ${siblings.length}</p>
        <h2 id="category-title" tabindex="-1" lang="fr">${esc(category.name)}</h2>
        <p class="category-meta"><span>${plural(products.length, 'produit')}${hidden ? `, ${hidden} masqué${hidden > 1 ? 's' : ''}` : ''}</span><span>Adresse web : /${venue}#${esc(category.slug)}</span>${category.isVisible ? '' : '<span class="badge badge-hidden">Masquée du menu</span>'}</p>
        ${category.note ? `<p class="category-note" lang="fr">${esc(category.note)}</p>` : ''}
      </div>
      ${photoButton({ target: 'category', id: category.id, url: category.imageUrl, color: colorFor(category.id), label: 'Changer la photo', name: category.name, focusKey: 'category-photo', className: 'category-photo-button' })}
      ${warning ? `<p class="notice notice-warning">${icon('info')}<span>${warning}</span></p>` : ''}
      <div class="action-row">
        <button type="button" class="btn btn-secondary btn-small" data-action="category-edit" data-id="${category.id}" data-focus-key="category-edit">Modifier la catégorie</button>
        <button type="button" class="btn btn-secondary btn-small" data-action="category-visibility" data-id="${category.id}" data-visible="${!category.isVisible}" data-focus-key="category-visibility">${category.isVisible ? 'Masquer du menu' : 'Afficher dans le menu'}</button>
        <button type="button" class="btn btn-secondary btn-small" data-action="category-move" data-id="${category.id}" data-direction="up" data-focus-key="category-up"${index <= 0 ? ' disabled' : ''}>${icon('up', 16)} Monter</button>
        <button type="button" class="btn btn-secondary btn-small" data-action="category-move" data-id="${category.id}" data-direction="down" data-focus-key="category-down"${index === siblings.length - 1 ? ' disabled' : ''}>${icon('down', 16)} Descendre</button>
        <button type="button" class="btn btn-danger-outline btn-small" data-action="category-delete" data-id="${category.id}" data-focus-key="category-delete">Supprimer la catégorie</button>
      </div>
    </div>
    <div class="section-bar"><div><h3>Produits</h3><p>${products.length > 1 ? 'Dans l’ordre où les clients les voient. Monter et Descendre changent uniquement l’ordre sur le site.' : 'Les clients voient les produits dans cet ordre.'}</p></div><button type="button" class="btn btn-primary" data-action="product-new" data-category="${category.id}" data-focus-key="product-new">${icon('plus')} Ajouter un produit</button></div>
    ${products.length
      ? `<ol class="product-list">${products.map((product, i) => productRow(product, { index: i, count: products.length })).join('')}</ol>`
      : `<div class="empty-state"><h3>Aucun produit dans cette catégorie</h3><p>Les clients ne verront pas <span lang="fr">${esc(quoted(category.name))}</span> tant qu’elle ne contient pas au moins un produit visible.</p><div class="button-row"><button type="button" class="btn btn-primary" data-action="product-new" data-category="${category.id}" data-focus-key="empty-product-new">${icon('plus')} Ajouter un produit</button></div></div>`}
  </section>`;
}

function renderResults() {
  const matches = filteredProducts();
  const scope = view.categoryId ? categoryById(view.categoryId) : null;
  const described = [
    view.q.trim() && `correspondant à « ${esc(view.q.trim())} »`,
    view.visibility === 'visible' && 'visibles uniquement',
    view.visibility === 'hidden' && 'masqués uniquement',
    scope ? `dans <span lang="fr">${esc(scope.name)}</span>` : 'dans toutes les catégories',
  ].filter(Boolean).join(', ');
  const heading = filtersActive() ? `${plural(matches.length, 'produit')} trouvé${matches.length > 1 ? 's' : ''}` : `Tous les produits (${matches.length})`;
  const byCategory = state.categories
    .map((category) => ({ category, products: matches.filter((product) => product.categoryId === category.id) }))
    .filter((entry) => entry.products.length);
  return `<section aria-labelledby="results-title">
    <div class="section-bar"><div><h2 id="results-title" tabindex="-1">${heading}</h2><p>${described[0].toUpperCase()}${described.slice(1)}. Pour modifier l’ordre, ouvrez une catégorie.</p></div>${filtersActive() ? '<button type="button" class="btn btn-secondary btn-small" data-action="filters-clear" data-focus-key="results-clear">Effacer la recherche et les filtres</button>' : ''}</div>
    ${byCategory.length ? byCategory.map(({ category, products }) => `<div class="result-group"><div class="section-bar"><h3 lang="fr">${esc(category.name)}</h3><a class="btn btn-quiet btn-small" href="${esc(viewUrl(categoryView(category.id)))}" data-nav="category" data-id="${category.id}">Ouvrir la catégorie<span class="sr-only"> ${esc(category.name)}</span></a></div><ol class="product-list">${products.map((product) => productRow(product, { orderable: false })).join('')}</ol></div>`).join('')
      : `<div class="empty-state"><h3>Aucun produit ne correspond</h3><p>Essayez un autre mot, ou effacez la recherche et les filtres.</p><div class="button-row"><button type="button" class="btn btn-primary" data-action="filters-clear" data-focus-key="empty-clear">Effacer la recherche et les filtres</button></div></div>`}
  </section>`;
}

function renderStructure() {
  let number = 0;
  const all = sections();
  const namedGroups = state.groups.length;
  const cards = all.map(({ group, categories }, groupIndex) => {
    const rows = categories.map((category, index) => {
      number += 1;
      const key = `structure-category-${category.id}`;
      const name = `<span class="sr-only"> ${esc(category.name)}</span>`;
      const count = productsOf(category.id).length;
      return `<li data-row="category-${category.id}">
        <span class="row-number"><span class="sr-only">Position </span>${number}</span>
        ${arch(category.imageUrl, colorFor(category.id), 'thumb')}
        <div class="order-name"><a href="${esc(viewUrl(categoryView(category.id)))}" data-nav="category" data-id="${category.id}" lang="fr">${esc(category.name)}</a><span class="order-meta">${plural(count, 'produit')}</span>${category.isVisible ? '' : '<span class="badge badge-hidden">Masquée</span>'}</div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-small" data-action="category-move" data-id="${category.id}" data-direction="up" data-focus-key="${key}-up"${index === 0 ? ' disabled' : ''}>${icon('up', 16)} Monter${name}</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="category-move" data-id="${category.id}" data-direction="down" data-focus-key="${key}-down"${index === categories.length - 1 ? ' disabled' : ''}>${icon('down', 16)} Descendre${name}</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="category-edit" data-id="${category.id}" data-focus-key="${key}-edit">Modifier${name}</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="category-visibility" data-id="${category.id}" data-visible="${!category.isVisible}" data-focus-key="${key}-visibility">${category.isVisible ? 'Masquer' : 'Afficher'}${name}</button>
        </div>
      </li>`;
    }).join('');
    const list = categories.length ? `<ol class="order-list">${rows}</ol>` : `<p class="group-empty">Aucune catégorie dans ce groupe pour le moment. Choisissez-le lorsque vous ajoutez ou modifiez une catégorie.</p>`;
    if (!group) {
      return `<li class="group-card is-loose"><div class="group-head"><div><p class="eyebrow">Affiché en dernier</p><h3>Sans groupe</h3><p class="hint">Catégories affichées sans titre de groupe.</p></div></div>${list}</li>`;
    }
    const key = `group-${group.id}`;
    const name = `<span class="sr-only"> ${esc(group.name)}</span>`;
    return `<li class="group-card" data-row="${key}"><div class="group-head"><div><p class="eyebrow">Groupe ${groupIndex + 1} sur ${namedGroups}</p><h3 lang="fr">${esc(group.name)}</h3><p class="hint">${plural(categories.length, 'catégorie', 'catégories')}</p></div><div class="action-row">
      <button type="button" class="btn btn-secondary btn-small" data-action="group-rename" data-id="${group.id}" data-focus-key="${key}-rename">Renommer${name}</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="group-move" data-id="${group.id}" data-direction="up" data-focus-key="${key}-up"${groupIndex === 0 ? ' disabled' : ''}>${icon('up', 16)} Monter${name}</button>
      <button type="button" class="btn btn-secondary btn-small" data-action="group-move" data-id="${group.id}" data-direction="down" data-focus-key="${key}-down"${groupIndex === namedGroups - 1 ? ' disabled' : ''}>${icon('down', 16)} Descendre${name}</button>
      <button type="button" class="btn btn-danger-outline btn-small" data-action="group-delete" data-id="${group.id}" data-focus-key="${key}-delete">Supprimer${name}</button>
    </div></div>${list}</li>`;
  }).join('');
  return `<section class="structure" aria-labelledby="structure-title">
    <div class="section-bar"><div><h2 id="structure-title" tabindex="-1">Groupes et ordre des catégories</h2><p>Voici l’ordre du menu public ${venueLabel}, dans sa navigation et sur la page. Cela ne change rien d’autre.</p></div><div class="button-row"><button type="button" class="btn btn-secondary" data-action="group-new" data-focus-key="group-new">${icon('plus')} Ajouter un groupe</button><button type="button" class="btn btn-primary" data-action="category-new" data-focus-key="structure-category-new">${icon('plus')} Ajouter une catégorie</button></div></div>
    ${cards ? `<ol class="group-list">${cards}</ol>` : `<div class="empty-state"><h3>Aucune catégorie pour le moment</h3><p>Commencez par une catégorie, comme « Boissons fraîches ». Les groupes sont des titres facultatifs au-dessus des catégories.</p><div class="button-row"><button type="button" class="btn btn-primary" data-action="category-new">${icon('plus')} Ajouter une catégorie</button></div></div>`}
  </section>`;
}

// The top of the public page, drawn in the venue's colours. In the editor
// each part has its own button; in the "Name and text" panel it is a preview.
function bandHtml(details, { editable = true } = {}) {
  const { title, subtitle, eyebrow, logoImageUrl, heroImageUrl, heroImageAlt } = details;
  const heading = editable ? 'h1' : 'p';
  return `<div class="venue-band-inner">
    <div class="band-copy">
      <div class="band-brand"><span class="band-logo${logoImageUrl ? ' has-image' : ''}" data-image>${logoImageUrl ? `<img src="${esc(logoImageUrl)}" alt="">` : ''}</span>${eyebrow ? `<span class="band-eyebrow" lang="fr">${esc(eyebrow)}</span>` : ''}</div>
      <${heading} class="band-title" lang="fr">${esc(title || 'Nom affiché sur la page')}${subtitle ? ` <span>${esc(subtitle)}</span>` : ''}</${heading}>
      ${editable ? `<div class="band-actions"><button type="button" class="btn btn-on-dark" data-action="photo" data-target="venue" data-slot="logo" data-focus-key="venue-logo">Changer le logo</button><button type="button" class="btn btn-on-dark" data-action="venue-text" data-focus-key="venue-text">Changer le nom et le texte</button></div>` : ''}
    </div>
    <div class="band-photo"><span class="band-frame"><span class="band-arch${heroImageUrl ? ' has-image' : ''}" data-image>${heroImageUrl ? `<img src="${esc(heroImageUrl)}" alt="${esc(heroImageAlt)}">` : ''}</span></span>${editable ? '<button type="button" class="btn btn-on-dark" data-action="photo" data-target="venue" data-slot="hero" data-focus-key="venue-hero">Changer la photo</button>' : ''}</div>
  </div>`;
}
function renderVenueHeader() {
  header.innerHTML = bandHtml(state.venue);
}

function renderActivityShell() {
  return `<section aria-labelledby="activity-title"><div class="section-bar"><div><h2 id="activity-title" tabindex="-1">Activité</h2><p>Modifications apportées au menu ${venueLabel} dans cette administration, de la plus récente à la plus ancienne.</p></div></div><ol class="history" id="history" aria-busy="true"><li><p class="muted">Chargement de l’historique…</p></li></ol><div class="button-row" id="history-more" hidden><button type="button" class="btn btn-secondary" data-action="history-more">Afficher les modifications précédentes</button></div></section>`;
}
const historyTime = new Intl.DateTimeFormat('fr-TN', { dateStyle: 'medium', timeStyle: 'short' });
let historyCursor = null;
async function loadHistory({ append = false } = {}) {
  const list = document.getElementById('history');
  if (!list) return;
  try {
    const data = await apiGet('audit', { venue, ...(append && historyCursor ? { before: historyCursor } : {}) });
    if (!document.getElementById('history')) return;
    const items = data.entries.map((entry) => `<li><p>${esc(entry.summary)}</p><small><time datetime="${esc(entry.createdAt)}">${historyTime.format(new Date(entry.createdAt))}</time>${entry.actor ? ` · ${esc(entry.actor)}` : ''}</small></li>`).join('');
    if (append) list.insertAdjacentHTML('beforeend', items);
    else list.innerHTML = items || '<li><p class="muted">Aucune modification pour le moment. Les changements effectués ici apparaîtront avec leur heure.</p></li>';
    list.removeAttribute('aria-busy');
    historyCursor = data.entries.at(-1)?.id ?? null;
    document.getElementById('history-more').hidden = !data.more;
  } catch (error) {
    list.innerHTML = `<li><p class="field-error">${icon('alert')} Impossible de charger l’historique. ${esc(error.message)}</p></li>`;
  }
}

function renderContent() {
  const content = document.getElementById('content');
  if (view.screen === 'structure') content.innerHTML = renderStructure();
  else if (view.screen === 'activity') {
    content.innerHTML = renderActivityShell();
    historyCursor = null;
    loadHistory();
  } else if (!state.categories.length) {
    content.innerHTML = `<div class="empty-state"><h2>Ce menu ne contient pas encore de catégorie</h2><p>Les produits appartiennent toujours à une catégorie. Ajoutez la première pour commencer.</p><div class="button-row"><button type="button" class="btn btn-primary" data-action="category-new">${icon('plus')} Ajouter une catégorie</button></div></div>`;
  } else if (filtersActive() || !view.categoryId) content.innerHTML = renderResults();
  else content.innerHTML = renderCategory(categoryById(view.categoryId));
}

// Re-renders from state, keeping keyboard focus on the same control. A move
// button that became disabled (the item reached the top or bottom) hands
// focus to its partner.
function render({ focus = null, highlight = null } = {}) {
  const active = document.activeElement;
  const key = app.contains(active) || header.contains(active) ? active.dataset.focusKey : null;
  normalizeView();
  renderVenueHeader();
  renderNav();
  syncFilters();
  renderContent();
  app.removeAttribute('aria-busy');
  if (focus === 'heading') focusHeading();
  else if (key) restoreFocus(key);
  if (highlight) flash(highlight);
}
function restoreFocus(key) {
  const find = (k) => document.querySelector(`#venue-header [data-focus-key="${CSS.escape(k)}"], #app [data-focus-key="${CSS.escape(k)}"]`);
  let target = find(key);
  if (target?.disabled) {
    const partner = key.endsWith('-up') ? key.replace(/-up$/, '-down') : key.endsWith('-down') ? key.replace(/-down$/, '-up') : null;
    target = partner ? find(partner) : null;
  }
  if (target && !target.disabled) target.focus();
  else focusHeading();
}
function focusHeading() {
  const heading = document.querySelector('#content h2[tabindex]');
  heading?.focus({ preventScroll: true });
  (heading?.closest('section') ?? heading)?.scrollIntoView?.({ block: 'nearest' });
}
function flash(rowKey) {
  const row = app.querySelector(`[data-row="${CSS.escape(rowKey)}"]`);
  if (!row) return;
  row.classList.add('just-changed');
  setTimeout(() => row.classList.remove('just-changed'), 1800);
}

// ---------------------------------------------------------------------------
// Running changes

let busy = false;
async function mutate(op, input, { button = null, working = 'Enregistrement…', highlight = null, errorPrefix = '', quiet = false } = {}) {
  if (busy) return null;
  busy = true;
  app.setAttribute('aria-busy', 'true');
  const label = button?.innerHTML;
  if (button) {
    button.classList.add('is-working');
    button.setAttribute('aria-disabled', 'true');
    button.innerHTML = working;
  }
  announce(working);
  try {
    const result = await apiPost(op, input);
    busy = false;
    applyResult(result, { highlight, quiet });
    return result;
  } catch (error) {
    if (button?.isConnected) button.innerHTML = label;
    if (quiet) announce(error.message, { assertive: true });
    else reportError(error, { prefix: errorPrefix });
    return null;
  } finally {
    busy = false;
    app.removeAttribute('aria-busy');
    if (button?.isConnected) {
      button.classList.remove('is-working');
      button.removeAttribute('aria-disabled');
    }
  }
}

function applyResult(result, { highlight = null, focus = null, quiet = false } = {}) {
  state = result.state;
  render({ highlight, focus });
  if (quiet) return;
  if (result.message) {
    toast(result.message, result.undo ? {
      action: {
        label: 'Annuler',
        onClick: async (button) => Boolean(await mutate('undo', { deletionId: result.undo.id }, { button, working: 'Annulation…' })),
      },
    } : {});
  }
  if (result.warning) toast(result.warning, { type: 'warning' });
}

// ---------------------------------------------------------------------------
// Dialogs

function mountDialog(html, { opener = document.activeElement, onCancel } = {}) {
  const openerKey = opener?.dataset?.focusKey;
  const dialog = fragment(html).firstElementChild;
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onCancel?.();
  });
  // Tab and Shift+Tab loop inside the dialog, as on the public menu.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button, input, select, textarea, a[href]')]
      .filter((element) => !element.disabled && element.type !== 'hidden' && !element.hidden && element.getClientRects().length > 0);
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault();
      controls.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
      event.preventDefault();
      controls[0].focus();
    }
  });
  dialog.addEventListener('close', () => {
    adoptToasts(dialog);
    dialog.remove();
    if (topDialog()) return;
    // The page may have been redrawn meanwhile: find the same control again.
    const target = opener?.isConnected ? opener : openerKey ? document.querySelector(`[data-focus-key="${CSS.escape(openerKey)}"]`) : null;
    if (target && !target.disabled) target.focus();
    else focusHeading();
  });
  dialog.showModal();
  return dialog;
}

function confirmDialog({ title, body, confirmLabel, cancelLabel = 'Annuler', danger = true }) {
  return new Promise((resolve) => {
    const id = nextId('confirm');
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      dialog.close();
      resolve(value);
    };
    const dialog = mountDialog(`<dialog class="confirm${danger ? ' is-danger' : ''}" role="alertdialog" aria-labelledby="${id}-title" aria-describedby="${id}-body"><div class="confirm-body"><h2 id="${id}-title">${title}</h2><div id="${id}-body" class="confirm-text">${body}</div></div><div class="confirm-foot"><button type="button" class="btn btn-secondary" data-cancel>${esc(cancelLabel)}</button><button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button></div></dialog>`, { onCancel: () => finish(false) });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => finish(false));
    dialog.querySelector('[data-confirm]').addEventListener('click', () => finish(true));
    dialog.addEventListener('close', () => { if (!answered) { answered = true; resolve(false); } });
    dialog.querySelector('[data-cancel]').focus();
  });
}

// ---------------------------------------------------------------------------
// Forms in the side panel

function field({ id, name, label, value = '', hint = '', optional = false, textarea = false, maxlength, inputmode, affix = '', lang = '', autocomplete = 'off' }) {
  const describedBy = [hint && `${id}-hint`, `${id}-error`].filter(Boolean).join(' ');
  const attributes = `id="${id}" name="${name}" aria-describedby="${describedBy}"${maxlength ? ` maxlength="${maxlength}"` : ''}${inputmode ? ` inputmode="${inputmode}"` : ''}${lang ? ` lang="${lang}"` : ''}${optional ? '' : ' aria-required="true"'} autocomplete="${autocomplete}"`;
  const control = textarea ? `<textarea ${attributes} rows="3">${esc(value)}</textarea>` : `<input ${attributes} value="${esc(value)}">`;
  return `<div class="field" data-field="${name}"><label for="${id}">${esc(label)}${optional ? ' <span class="optional">(facultatif)</span>' : ''}</label>${affix ? `<div class="affix">${control}<span aria-hidden="true">${affix}</span></div>` : control}${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}<p class="field-error" id="${id}-error" hidden></p></div>`;
}

function clearErrors(form) {
  for (const error of form.querySelectorAll('.field-error:not([data-photo-error])')) {
    error.hidden = true;
    error.textContent = '';
  }
  for (const control of form.querySelectorAll('[aria-invalid]')) control.removeAttribute('aria-invalid');
  const alert = form.querySelector('[data-form-alert]');
  if (alert) alert.hidden = true;
}
function showErrors(form, errors) {
  let first = null;
  for (const [name, message] of Object.entries(errors ?? {})) {
    const wrapper = form.querySelector(`[data-field="${name}"]`);
    if (!wrapper) continue;
    const error = wrapper.querySelector('.field-error');
    error.innerHTML = `${icon('alert', 16)}<span>${esc(message)}</span>`;
    error.hidden = false;
    const control = wrapper.querySelector('input:not([type=checkbox]), select, textarea') ?? wrapper.querySelector('input');
    control?.setAttribute('aria-invalid', 'true');
    first ??= control;
  }
  return first;
}
function showFormAlert(form, title, message) {
  const alert = form.querySelector('[data-form-alert]');
  alert.innerHTML = `${icon('alert')}<div><strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
  alert.hidden = false;
}
const serialize = (form) => JSON.stringify([...new FormData(form)].filter(([, value]) => typeof value === 'string')
  .concat([...form.querySelectorAll('input[type=checkbox][name]')].map((box) => [box.name, box.checked])));

// Opens a side panel with a form. onSubmit returns the API result or throws.
let activePanel = null;
function openPanel({ eyebrow, title, body, submitLabel = 'Enregistrer les modifications', onSubmit, onInput, dirtyName = 'cet élément' }) {
  const id = nextId('panel');
  let saving = false;
  let initial = '';
  let dialog;
  async function requestClose() {
    if (saving) return;
    if (serialize(form) !== initial) {
      const discard = await confirmDialog({
        title: 'Annuler vos modifications ?',
        body: `<p>Vous avez modifié ${esc(dirtyName)} sans enregistrer. Si vous fermez maintenant, les modifications seront perdues.</p>`,
        confirmLabel: 'Annuler les modifications',
        cancelLabel: 'Continuer la modification',
      });
      if (!discard) return;
    }
    dialog.close();
  }
  dialog = mountDialog(`<dialog class="panel" aria-labelledby="${id}-title"><form class="panel-form" novalidate><header class="panel-head"><div><p class="eyebrow">${eyebrow}</p><h2 id="${id}-title">${title}</h2></div><button type="button" class="btn btn-quiet" data-panel-close>Fermer</button></header><div class="panel-body"><div class="form-alert" data-form-alert role="alert" hidden></div>${body}</div><footer class="panel-foot"><span class="save-state" data-save-state aria-hidden="true"></span><button type="button" class="btn btn-secondary" data-panel-close>Annuler</button><button type="submit" class="btn btn-primary" data-save>${esc(submitLabel)}</button></footer></form></dialog>`, { onCancel: requestClose });
  const form = dialog.querySelector('form');
  const save = dialog.querySelector('[data-save]');
  const saveState = dialog.querySelector('[data-save-state]');
  for (const button of dialog.querySelectorAll('[data-panel-close]')) button.addEventListener('click', requestClose);
  form.addEventListener('input', () => onInput?.(form));
  form.addEventListener('change', () => onInput?.(form));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    clearErrors(form);
    saving = true;
    save.disabled = true;
    save.textContent = 'Enregistrement…';
    saveState.textContent = 'Enregistrement…';
    announce('Enregistrement…');
    try {
      const result = await onSubmit(form);
      if (result === null) return; // stopped by client-side validation
      save.innerHTML = `${icon('check', 16)} Enregistré`;
      saveState.textContent = 'Enregistré';
      await wait(500);
      saving = false;
      dialog.close();
      applyResult(result, { highlight: result.highlight });
    } catch (error) {
      if (error.status === 401 || error.code === 'signed-out') {
        showFormAlert(form, 'Votre session a expiré.', 'Vos modifications sont toujours ici. Connectez-vous dans un nouvel onglet, puis appuyez de nouveau sur Enregistrer les modifications.');
        reportError(error);
      } else {
        const first = showErrors(form, error.fields);
        showFormAlert(form, 'Impossible d’enregistrer les modifications. Vos modifications sont toujours ici.', error.message);
        toast('Impossible d’enregistrer les modifications. Vos modifications sont toujours ici.', { type: 'error', detail: error.message });
        (first ?? form.querySelector('[data-form-alert]')).focus?.();
        if (!first) form.querySelector('[data-form-alert]').scrollIntoView({ block: 'nearest' });
      }
    } finally {
      if (dialog.open) {
        saving = false;
        save.disabled = false;
        save.textContent = submitLabel;
        saveState.textContent = '';
      }
    }
  });
  // Client-side check first: messages appear next to their fields.
  form.validateWith = (errors) => {
    if (!hasErrors(errors)) return true;
    const first = showErrors(form, errors);
    const count = Object.keys(errors).length;
    showFormAlert(form, `Corrigez ${count === 1 ? 'le champ signalé' : `les ${count} champs signalés`}.`, 'Aucune modification n’a encore été enregistrée.');
    announce(`Corrigez ${plural(count, 'champ')}.`, { assertive: true });
    first?.focus();
    return false;
  };
  onInput?.(form);
  initial = serialize(form);
  form.markSaved = () => { initial = serialize(form); };
  // The caret starts at the end of the text, ready to add to it.
  const firstInput = form.querySelector('input:not([type=hidden]):not([type=file]), textarea, select');
  firstInput?.focus();
  if (typeof firstInput?.setSelectionRange === 'function') firstInput.setSelectionRange(firstInput.value.length, firstInput.value.length);
  const panel = { dialog, form, isDirty: () => serialize(form) !== initial, close: () => dialog.close(), requestClose };
  activePanel = panel;
  dialog.addEventListener('close', () => { if (activePanel === panel) activePanel = null; });
  return panel;
}

// ---------------------------------------------------------------------------
// Products

function previewHtml({ name, description, millimes, isHouse, imageUrl, color }) {
  return `<article class="dish${imageUrl ? ' has-photo' : ''}">${imageUrl ? `<span class="arch dish-photo has-image" data-image style="--photo-color:${esc(color)}" aria-hidden="true"><img src="${esc(imageUrl)}" alt=""></span>` : ''}<div class="dish-heading"><h3 lang="fr"><span>${esc(name || 'Nom du produit')}</span>${isHouse ? '<span class="house-mark">Maison</span>' : ''}</h3><span class="dish-rule" aria-hidden="true"></span><span class="price">${millimes == null ? '<span class="millimes">– DT</span>' : publicPrice(millimes)}</span></div>${description ? `<p lang="fr">${esc(description)}</p>` : ''}</article>`;
}

function readProductForm(form) {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    description: data.get('description'),
    price: data.get('price'),
    categoryId: Number(data.get('categoryId')) || null,
    isVisible: form.elements.isVisible.checked,
    isHouse: form.elements.isHouse.checked,
  };
}

function openProductPanel(productId, { categoryId = null } = {}) {
  if (!state.categories.length) {
    toast('Ajoutez d’abord une catégorie. Chaque produit appartient à une catégorie.', { type: 'warning' });
    return;
  }
  const product = productId ? productById(productId) : null;
  if (productId && !product) return refreshState();
  const startCategory = categoryById(product?.categoryId ?? categoryId ?? view.categoryId) ?? state.categories[0];
  const imageUrl = () => (product ? productById(product.id)?.imageUrl : null);
  const body = `
    ${field({ id: 'p-name', name: 'name', label: 'Nom', value: product?.name ?? '', maxlength: LIMITS.name, lang: 'fr' })}
    ${field({ id: 'p-description', name: 'description', label: 'Description', value: product?.description ?? '', optional: true, textarea: true, maxlength: LIMITS.description, lang: 'fr', hint: 'Affichée sous le nom. Laissez vide pour les articles simples, comme les boissons.' })}
    ${field({ id: 'p-price', name: 'price', label: 'Prix', value: product ? priceInputValue(product.millimes) : '', inputmode: 'decimal', affix: 'DT', maxlength: 12, hint: 'En dinars, avec au plus trois décimales pour les millimes. Par exemple 12.500 ou 8.' })}
    <div class="field" data-field="categoryId"><label for="p-category">Catégorie</label><select id="p-category" name="categoryId" aria-describedby="p-category-hint p-category-error">${categoryOptions(startCategory.id)}</select><p class="hint" id="p-category-hint">${product ? 'Choisir une autre catégorie déplace le produit à la fin de celle-ci.' : 'Le nouveau produit est ajouté à la fin de cette catégorie.'}</p><p class="field-error" id="p-category-error" hidden></p></div>
    <fieldset class="form-section" data-field="isVisible"><legend class="sr-only">Dans le menu public</legend><h3 aria-hidden="true">Dans le menu public</h3>
      <label class="check"><input type="checkbox" name="isVisible"${product ? (product.isVisible ? ' checked' : '') : ' checked'}><span><strong>Visible par les clients</strong><small>Décochez pour le masquer sans le supprimer.</small></span></label>
      <label class="check"><input type="checkbox" name="isHouse"${product?.isHouse ? ' checked' : ''}><span><strong>Afficher le badge « Maison »</strong><small>Indique une spécialité de la maison.</small></span></label>
      <p class="field-error" hidden></p>
    </fieldset>
    <section class="form-section"><h3>Photo</h3>${product ? '<div class="photo-inline" data-photo-inline></div>' : '<p class="hint">Enregistrez d’abord le produit. Appuyez ensuite sur « Photo » à côté de lui pour en ajouter une.</p>'}</section>
    <section class="form-section"><h3>Aperçu dans le menu public</h3><div class="menu-preview venue-${venue}" data-preview></div><p class="preview-note" data-preview-note></p></section>
    ${product ? `<section class="form-section more-actions"><h3>Autres actions</h3><div class="button-row"><button type="button" class="btn btn-secondary" data-panel-action="duplicate">Dupliquer le produit</button><button type="button" class="btn btn-danger-outline" data-panel-action="delete">Supprimer le produit…</button></div><p class="hint">Une copie est masquée et placée juste après ce produit.</p></section>` : ''}`;

  const panel = openPanel({
    eyebrow: `${esc(venueLabel)} · <span lang="fr">${esc(startCategory.name)}</span>`,
    title: product ? 'Modifier le produit' : 'Ajouter un produit',
    submitLabel: product ? 'Enregistrer les modifications' : 'Ajouter le produit',
    dirtyName: product ? quoted(product.name) : 'le nouveau produit',
    body,
    onInput(form) {
      const values = readProductForm(form);
      const price = parsePrice(values.price);
      const category = categoryById(values.categoryId);
      form.querySelector('[data-preview]').innerHTML = previewHtml({
        name: values.name.trim(), description: values.description.trim(), millimes: price.millimes ?? null,
        isHouse: values.isHouse, imageUrl: imageUrl(), color: colorFor(values.categoryId),
      });
      form.querySelector('[data-preview-note]').textContent = !values.isVisible
        ? 'Masqué : les clients ne verront pas ce produit.'
        : category && !category.isVisible ? `Sa catégorie ${quoted(category.name)} est masquée ; les clients ne le verront donc pas encore.` : 'Voici ce que verront les clients.';
    },
    async onSubmit(form) {
      const values = readProductForm(form);
      if (!form.validateWith(validateProduct(values).errors)) return null;
      const result = await apiPost(product ? 'product.update' : 'product.create', { ...(product ? { id: product.id } : {}), ...values });
      if (!product && result.id) {
        view = categoryView(values.categoryId);
        history.pushState(null, '', viewUrl());
      }
      return { ...result, highlight: `product-${product?.id ?? result.id}` };
    },
  });
  if (product) wireInlinePhoto(panel, 'product', product.id);
  panel.form.querySelector('[data-panel-action="duplicate"]')?.addEventListener('click', async (event) => {
    if (panel.isDirty()) {
      toast('Enregistrez ou annulez d’abord vos modifications, puis dupliquez le produit.', { type: 'warning' });
      return;
    }
    const result = await mutate('product.duplicate', { id: product.id }, { button: event.currentTarget, working: 'Duplication…', highlight: null });
    if (!result) return;
    panel.close();
    openProductPanel(result.id);
  });
  panel.form.querySelector('[data-panel-action="delete"]')?.addEventListener('click', async () => {
    const current = productById(product.id);
    const ok = await confirmDialog({
      title: `Supprimer ${esc(quoted(current.name))} ?`,
      body: `<p>Le produit <span class="record" lang="fr">${esc(quoted(current.name))}</span> (${esc(formatPrice(current.millimes))}) sera supprimé du menu ${esc(venueLabel)}.${panel.isDirty() ? ' Vos modifications non enregistrées seront perdues.' : ''}</p><p class="hint">Vous pourrez annuler cette action pendant quelques minutes.</p>`,
      confirmLabel: 'Supprimer le produit',
    });
    if (!ok) return;
    panel.form.markSaved();
    panel.close();
    await mutate('product.delete', { id: current.id }, { working: 'Suppression…' });
  });
}

// ---------------------------------------------------------------------------
// Categories

function readCategoryForm(form) {
  const data = new FormData(form);
  const group = data.get('groupId');
  return {
    name: data.get('name'),
    slug: data.get('slug'),
    note: data.get('note'),
    groupId: group ? Number(group) : null,
    isVisible: form.elements.isVisible.checked,
  };
}

function openCategoryPanel(categoryId, { groupId } = {}) {
  const category = categoryId ? categoryById(categoryId) : null;
  if (categoryId && !category) return refreshState();
  const current = view.categoryId ? categoryById(view.categoryId) : null;
  const startGroup = category ? category.groupId : groupId !== undefined ? groupId : current?.groupId ?? state.groups[0]?.id ?? null;
  const groupOptions = `<option value="">Sans groupe</option>${state.groups.map((group) => `<option value="${group.id}"${group.id === startGroup ? ' selected' : ''}>${esc(group.name)}</option>`).join('')}`;
  const body = `
    ${field({ id: 'c-name', name: 'name', label: 'Nom', value: category?.name ?? '', maxlength: LIMITS.name, lang: 'fr' })}
    ${field({ id: 'c-slug', name: 'slug', label: 'Adresse web', value: category?.slug ?? '', maxlength: LIMITS.slug, hint: `${category ? 'La modifier casse les liens qui pointent directement vers cette catégorie. ' : 'Elle est remplie à partir du nom. '}Lettres minuscules, chiffres et traits d’union. Elle apparaît ainsi : <code>/${venue}#<span data-slug-preview>${esc(category?.slug ?? 'nom')}</span></code>.` })}
    ${field({ id: 'c-note', name: 'note', label: 'Note du menu', value: category?.note ?? '', optional: true, textarea: true, maxlength: LIMITS.note, lang: 'fr', hint: 'Une courte ligne sous le nom de la catégorie, par exemple « En supplément de votre plat. »' })}
    <div class="field" data-field="groupId"><label for="c-group">Groupe</label><select id="c-group" name="groupId" aria-describedby="c-group-hint c-group-error">${groupOptions}</select><p class="hint" id="c-group-hint">${category ? 'Choisir un autre groupe déplace la catégorie à la fin de celui-ci.' : 'La nouvelle catégorie est ajoutée à la fin de ce groupe.'}</p><p class="field-error" id="c-group-error" hidden></p></div>
    <fieldset class="form-section" data-field="isVisible"><legend class="sr-only">Dans le menu public</legend><h3 aria-hidden="true">Dans le menu public</h3><label class="check"><input type="checkbox" name="isVisible"${category ? (category.isVisible ? ' checked' : '') : ' checked'}><span><strong>Visible par les clients</strong><small>Une catégorie masquée et tous ses produits disparaissent du menu, mais restent enregistrés ici.</small></span></label><p class="field-error" hidden></p></fieldset>
    <section class="form-section"><h3>Photo</h3>${category ? '<div class="photo-inline" data-photo-inline></div>' : '<p class="hint">Enregistrez d’abord la catégorie. Appuyez ensuite sur « Changer la photo » à côté de son nom pour en ajouter une.</p>'}</section>
    ${category ? '<section class="form-section more-actions"><h3>Autres actions</h3><div class="button-row"><button type="button" class="btn btn-danger-outline" data-panel-action="delete">Supprimer la catégorie…</button></div></section>' : ''}`;
  let slugEdited = Boolean(category);
  const panel = openPanel({
    eyebrow: esc(`${venueLabel} menu`),
    title: category ? 'Modifier la catégorie' : 'Ajouter une catégorie',
    submitLabel: category ? 'Enregistrer les modifications' : 'Ajouter la catégorie',
    dirtyName: category ? quoted(category.name) : 'la nouvelle catégorie',
    body,
    onInput(form) {
      const slug = form.elements.slug;
      if (!slugEdited) slug.value = slugify(form.elements.name.value);
      form.querySelector('[data-slug-preview]').textContent = slug.value || 'nom';
    },
    async onSubmit(form) {
      const values = readCategoryForm(form);
      if (!form.validateWith(validateCategory(values).errors)) return null;
      const result = await apiPost(category ? 'category.update' : 'category.create', { ...(category ? { id: category.id } : {}), ...values });
      if (!category && result.id && view.screen === 'products') {
        view = categoryView(result.id);
        history.pushState(null, '', viewUrl());
      }
      return { ...result, highlight: `category-${category?.id ?? result.id}` };
    },
  });
  panel.form.elements.slug.addEventListener('input', () => { slugEdited = true; });
  if (category) wireInlinePhoto(panel, 'category', category.id);
  panel.form.querySelector('[data-panel-action="delete"]')?.addEventListener('click', async () => {
    if (panel.isDirty()) {
      toast('Enregistrez ou annulez d’abord vos modifications, puis supprimez la catégorie.', { type: 'warning' });
      return;
    }
    panel.close();
    openCategoryDelete(category.id);
  });
}

async function openCategoryDelete(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return refreshState();
  const products = productsOf(category.id);
  const count = products.length;
  const name = esc(quoted(category.name));
  if (!count) {
    const ok = await confirmDialog({
      title: `Supprimer ${name} ?`,
      body: `<p>La catégorie <span class="record" lang="fr">${name}</span> ne contient aucun produit. Elle sera supprimée du menu ${esc(venueLabel)}.</p><p class="hint">Vous pourrez annuler cette action pendant quelques minutes.</p>`,
      confirmLabel: 'Supprimer la catégorie',
    });
    if (ok) await mutate('category.delete', { id: category.id, mode: 'empty', expectedProductCount: 0 }, { working: 'Suppression…' });
    return;
  }
  const others = state.categories.filter((other) => other.id !== category.id);
  const id = nextId('delete');
  const productList = `<ul class="affected" aria-label="Produits de cette catégorie" lang="fr">${products.map((product) => `<li>${esc(product.name)} · ${esc(formatPrice(product.millimes))}</li>`).join('')}</ul>`;
  const dialog = mountDialog(`<dialog class="confirm is-danger" role="alertdialog" aria-labelledby="${id}-title" aria-describedby="${id}-text"><div class="confirm-body" data-step></div><div class="confirm-foot" data-foot></div></dialog>`, { onCancel: () => dialog.close() });
  function showChoose() {
    dialog.querySelector('[data-step]').innerHTML = `<h2 id="${id}-title">Supprimer <span lang="fr">${name}</span> ?</h2>
      <p id="${id}-text"><span class="record" lang="fr">${name}</span> contient <strong>${plural(count, 'produit')}</strong>. Choisissez ce qui doit leur arriver :</p>
      <fieldset class="choices"><legend class="sr-only">Ce qui arrive aux produits</legend>
        <div class="choice"><label class="check"><input type="radio" name="${id}-mode" value="reassign"${others.length ? ' checked' : ' disabled'}><span><strong>Déplacer ${count === 1 ? 'le produit' : `les ${count} produits`} vers une autre catégorie</strong><small>Ils conservent leur ordre et sont ajoutés à la fin de la catégorie choisie.</small></span></label>${others.length ? `<div class="field"><label for="${id}-target">Déplacer vers</label><select id="${id}-target">${categoryOptions(others[0].id, { exclude: category.id })}</select></div>` : '<p class="hint">Il n’existe aucune autre catégorie vers laquelle les déplacer.</p>'}</div>
        <div class="choice is-danger"><label class="check"><input type="radio" name="${id}-mode" value="purge"${others.length ? '' : ' checked'}><span><strong>Supprimer la catégorie et ses ${plural(count, 'produit')}</strong><small>Une nouvelle confirmation vous sera demandée.</small></span></label></div>
      </fieldset>
      <p class="hint">Produits de cette catégorie :</p>${productList}`;
    dialog.querySelector('[data-foot]').innerHTML = `<button type="button" class="btn btn-secondary" data-cancel>Annuler</button><button type="button" class="btn btn-danger" data-next>Continuer</button>`;
    const next = dialog.querySelector('[data-next]');
    const sync = () => {
      const mode = dialog.querySelector(`input[name="${id}-mode"]:checked`)?.value;
      next.textContent = mode === 'reassign' ? 'Déplacer les produits et supprimer la catégorie' : 'Continuer';
    };
    dialog.querySelector('fieldset').addEventListener('change', sync);
    sync();
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    next.addEventListener('click', async () => {
      const mode = dialog.querySelector(`input[name="${id}-mode"]:checked`)?.value;
      if (mode === 'purge') return showPurge();
      const target = Number(dialog.querySelector(`#${id}-target`).value);
      const result = await mutate('category.delete', { id: category.id, mode: 'reassign', targetCategoryId: target, expectedProductCount: count }, { button: next, working: 'Déplacement et suppression…' });
      if (result) {
        dialog.close();
        if (view.screen === 'products') setView(categoryView(target), { focus: 'heading', push: false });
      }
    });
    dialog.querySelector('[data-cancel]').focus();
  }
  function showPurge() {
    dialog.querySelector('[data-step]').innerHTML = `<h2 id="${id}-title">Supprimer définitivement <span lang="fr">${name}</span> et ${plural(count, 'produit')} ?</h2><p id="${id}-text">Cette action supprime la catégorie <span class="record" lang="fr">${name}</span> et ces produits du menu ${esc(venueLabel)} :</p>${productList}<p>Vous pourrez annuler cette action pendant quelques minutes. Passé ce délai, ils ne pourront plus être récupérés.</p>`;
    dialog.querySelector('[data-foot]').innerHTML = `<button type="button" class="btn btn-secondary" data-back>Retour</button><button type="button" class="btn btn-danger" data-purge>Oui, supprimer la catégorie et ${plural(count, 'produit')}</button>`;
    dialog.querySelector('[data-back]').addEventListener('click', showChoose);
    dialog.querySelector('[data-purge]').addEventListener('click', async (event) => {
      const result = await mutate('category.delete', { id: category.id, mode: 'purge', confirm: true, expectedProductCount: count }, { button: event.currentTarget, working: 'Suppression…' });
      if (result) dialog.close();
    });
    dialog.querySelector('[data-back]').focus();
    announce(`Deuxième confirmation. ${plural(count, 'produit')} ${count === 1 ? 'sera supprimé' : 'seront supprimés'}.`);
  }
  showChoose();
}

// ---------------------------------------------------------------------------
// Groups

function openGroupDialog(groupId) {
  const group = groupId ? groupById(groupId) : null;
  const id = nextId('group');
  const panel = openPanel({
    eyebrow: esc(`${venueLabel} menu`),
    title: group ? 'Renommer le groupe' : 'Ajouter un groupe',
    submitLabel: group ? 'Enregistrer les modifications' : 'Ajouter le groupe',
    dirtyName: group ? quoted(group.name) : 'le nouveau groupe',
    body: `${field({ id: `${id}-name`, name: 'name', label: 'Nom du groupe', value: group?.name ?? '', maxlength: LIMITS.groupName, lang: 'fr', hint: 'Un titre au-dessus de plusieurs catégories dans la navigation du menu, par exemple « À boire ».' })}${group ? '' : '<p class="hint">Le nouveau groupe est ajouté à la fin. Vous pourrez ensuite le choisir lorsque vous ajouterez ou modifierez des catégories.</p>'}`,
    async onSubmit(form) {
      const values = { name: new FormData(form).get('name') };
      if (!form.validateWith(validateGroup(values).errors)) return null;
      const result = await apiPost(group ? 'group.rename' : 'group.create', { ...(group ? { id: group.id } : {}), ...values });
      return { ...result, highlight: `group-${group?.id ?? result.id}` };
    },
  });
  return panel;
}

async function openGroupDelete(groupId) {
  const group = groupById(groupId);
  if (!group) return refreshState();
  const name = esc(quoted(group.name));
  const inside = state.categories.filter((category) => category.groupId === group.id);
  if (inside.length) {
    const move = await confirmDialog({
      title: `Supprimer le groupe <span lang="fr">${name}</span> ?`,
      body: `<p><span class="record" lang="fr">${name}</span> contient encore ${plural(inside.length, 'catégorie', 'catégories')} :</p><ul class="affected" lang="fr">${inside.map((category) => `<li>${esc(category.name)}</li>`).join('')}</ul><p>Un groupe ne peut être supprimé que lorsqu’il est vide. Les déplacer vers « Sans groupe » les laisse dans le menu ; seul le titre du groupe disparaît. Rien n’est supprimé à cette étape.</p>`,
      confirmLabel: `Déplacer ${plural(inside.length, 'catégorie', 'catégories')} vers Sans groupe`,
      danger: false,
    });
    if (!move) return;
    const result = await mutate('group.ungroup', { id: group.id }, { working: 'Déplacement…' });
    if (!result) return;
  }
  const ok = await confirmDialog({
    title: `Supprimer le groupe <span lang="fr">${name}</span> ?`,
    body: `<p><span class="record" lang="fr">${name}</span> est vide. Son titre sera supprimé de la navigation du menu ${esc(venueLabel)}. Aucune catégorie ni aucun produit ne sera supprimé.</p><p class="hint">Vous pourrez annuler cette action pendant quelques minutes.</p>`,
    confirmLabel: 'Supprimer le groupe',
  });
  if (ok) await mutate('group.delete', { id: group.id }, { working: 'Suppression…' });
}

// ---------------------------------------------------------------------------
// Photos: saved straight away, with a confirmation before removal.

function recordForPhoto(target, id) {
  if (target === 'product') return productById(Number(id));
  if (target === 'category') return categoryById(Number(id));
  return null;
}
function photoUrl(target, id, slot) {
  if (target === 'venue') return slot === 'logo' ? state.venue.logoImageUrl : state.venue.heroImageUrl;
  return recordForPhoto(target, id)?.imageUrl ?? null;
}

async function shrinkPhoto(file, maxSide = 1600) {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 900 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    const webp = await encode('image/webp', 0.82);
    if (webp?.type === 'image/webp' && webp.size < file.size) return webp;
    const jpeg = file.type === 'image/png' ? null : await encode('image/jpeg', 0.85);
    return jpeg && jpeg.size < file.size ? jpeg : file;
  } finally {
    bitmap.close?.();
  }
}

async function preparePhoto(file) {
  if (!IMAGE_TYPES[file.type]) throw new Error(`${quoted(file.name)} n’est pas une photo JPEG, PNG ou WebP. Choisissez un autre fichier.`);
  if (file.size > MAX_SOURCE_BYTES) throw new Error(`Cette photo est trop volumineuse (${megabytes(file.size)}). Choisissez-en une de moins de ${megabytes(MAX_SOURCE_BYTES)}.`);
  let output = file;
  try {
    output = await shrinkPhoto(file);
  } catch {
    output = file;
  }
  const limit = state.uploads?.maxBytes ?? MAX_UPLOAD_BYTES;
  if (output.size > limit) throw new Error(`Cette photo reste trop volumineuse après redimensionnement (${megabytes(output.size)}). Choisissez-en une plus petite, de moins de ${megabytes(limit)}.`);
  return output;
}

// ---------------------------------------------------------------------------
// The cropper. A photo is almost never the shape of the frame it lands in, so
// before anything is sent the administrator decides what the frame keeps:
// drag to move, pinch, scroll or the slider to zoom. The window is the frame
// itself, at the venue's own shape, so there is nothing to imagine — what is
// inside the window is exactly what the menu shows. Only the cropped part is
// uploaded, which also keeps the files small.

const cropSupported = () => typeof createImageBitmap === 'function' && typeof document.createElement('canvas').toBlob === 'function';

// Smallest scale that still covers the window, so no empty corner can appear.
const coverScale = (bitmap, w, h) => Math.max(w / bitmap.width, h / bitmap.height);

async function encodeCrop(canvas, limit) {
  const encode = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  for (const quality of [0.86, 0.78, 0.68, 0.58]) {
    const webp = await encode('image/webp', quality);
    if (webp?.type === 'image/webp' && webp.size <= limit) return webp;
  }
  for (const quality of [0.86, 0.74, 0.62]) {
    const jpeg = await encode('image/jpeg', quality);
    if (jpeg?.type === 'image/jpeg' && jpeg.size <= limit) return jpeg;
  }
  return null;
}

// Resolves with the cropped photo, or null if the administrator backs out.
function openCropper(file, shape) {
  const spec = PHOTO_SHAPES[shape] ?? PHOTO_SHAPES.arch;
  return new Promise((resolve) => {
    let bitmap = null;
    let objectUrl = null;
    let dialog = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      bitmap?.close?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      dialog?.close();
      resolve(value);
    };

    createImageBitmap(file).then((decoded) => {
      if (settled) return decoded.close?.();
      bitmap = decoded;
      objectUrl = URL.createObjectURL(file);
      build();
    }).catch(() => finish(file)); // Undecodable here: let the server judge it.

    function build() {
      const uid = nextId('crop');
      dialog = mountDialog(`<dialog class="confirm crop-window" aria-labelledby="${uid}-title">
        <div class="confirm-body">
          <p class="eyebrow">Menu ${esc(venueLabel)}</p>
          <h2 id="${uid}-title">Cadrer la photo</h2>
          <p class="hint" id="${uid}-help">Glissez la photo pour la déplacer, et agrandissez-la avec le curseur, la molette ou deux doigts. Au clavier : les flèches déplacent, + et − agrandissent.</p>
          <div class="crop-stage">
            <div class="crop-view crop-${spec.mask}" style="--crop-aspect:${spec.aspect}" tabindex="0" role="group" aria-label="Cadrage de la photo" aria-describedby="${uid}-help" data-view>
              <img src="${esc(objectUrl)}" alt="" draggable="false" data-img>
            </div>
          </div>
          <div class="crop-controls">
            <button type="button" class="btn btn-secondary crop-step" data-zoom="out" aria-label="Réduire la photo">−</button>
            <label class="sr-only" for="${uid}-zoom">Agrandissement</label>
            <input id="${uid}-zoom" class="crop-range" type="range" min="0" max="1000" value="0" data-range>
            <button type="button" class="btn btn-secondary crop-step" data-zoom="in" aria-label="Agrandir la photo">+</button>
          </div>
          <p class="crop-note">${esc(spec.note)}</p>
        </div>
        <div class="confirm-foot">
          <button type="button" class="btn btn-quiet" data-reset>Tout recadrer</button>
          <button type="button" class="btn btn-secondary btn-large" data-cancel>Annuler</button>
          <button type="button" class="btn btn-primary btn-large" data-use>Utiliser cette photo</button>
        </div>
      </dialog>`, { onCancel: () => finish(null) });

      const view = dialog.querySelector('[data-view]');
      const img = dialog.querySelector('[data-img]');
      const range = dialog.querySelector('[data-range]');
      // Window size in CSS pixels, and where the photo sits inside it: `scale`
      // plus the offset of its top-left corner from the window's.
      let vw = 0, vh = 0, min = 1, max = 1, scale = 1, ox = 0, oy = 0;

      const clamp = () => {
        scale = Math.min(max, Math.max(min, scale));
        ox = Math.min(0, Math.max(vw - bitmap.width * scale, ox));
        oy = Math.min(0, Math.max(vh - bitmap.height * scale, oy));
      };
      const paint = () => {
        img.style.width = `${bitmap.width}px`;
        img.style.height = `${bitmap.height}px`;
        img.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
        const span = Math.log(max / min);
        range.value = String(Math.round(span > 0 ? (Math.log(scale / min) / span) * 1000 : 0));
      };
      // Zoom about a point in the window, so what is under the cursor, the
      // pinch or the middle of the frame stays put.
      const zoomTo = (next, cx = vw / 2, cy = vh / 2) => {
        const before = scale;
        scale = Math.min(max, Math.max(min, next));
        const k = scale / before;
        ox = cx - (cx - ox) * k;
        oy = cy - (cy - oy) * k;
        clamp();
        paint();
      };
      const reset = () => {
        const box = view.getBoundingClientRect();
        vw = box.width;
        vh = box.height;
        min = coverScale(bitmap, vw, vh);
        // Never past four times the frame, and never past the photo's own
        // pixels, so the result cannot be enlarged into mush.
        max = Math.max(min, Math.min(min * 4, (spec.width / vw) * min * 4, Math.max(min, 1)));
        if (max < min) max = min;
        scale = min;
        ox = (vw - bitmap.width * scale) / 2;
        oy = (vh - bitmap.height * scale) / 2;
        clamp();
        paint();
      };

      // Pointers: one drags, two pinch.
      const points = new Map();
      let pinch = null;
      view.addEventListener('pointerdown', (event) => {
        view.setPointerCapture(event.pointerId);
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (points.size === 2) {
          const [a, b] = [...points.values()];
          pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
        }
      });
      view.addEventListener('pointermove', (event) => {
        const previous = points.get(event.pointerId);
        if (!previous) return;
        const box = view.getBoundingClientRect();
        points.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (points.size >= 2 && pinch) {
          const [a, b] = [...points.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch.distance > 0) zoomTo(pinch.scale * (distance / pinch.distance), (a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
          return;
        }
        ox += event.clientX - previous.x;
        oy += event.clientY - previous.y;
        clamp();
        paint();
      });
      const release = (event) => {
        points.delete(event.pointerId);
        if (points.size < 2) pinch = null;
      };
      view.addEventListener('pointerup', release);
      view.addEventListener('pointercancel', release);
      view.addEventListener('wheel', (event) => {
        event.preventDefault();
        const box = view.getBoundingClientRect();
        zoomTo(scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX - box.left, event.clientY - box.top);
      }, { passive: false });
      view.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 32 : 12;
        const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (moves[event.key]) {
          event.preventDefault();
          ox += moves[event.key][0];
          oy += moves[event.key][1];
          clamp();
          paint();
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          zoomTo(scale * 1.15);
        } else if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          zoomTo(scale / 1.15);
        }
      });
      range.addEventListener('input', () => {
        const span = Math.log(max / min);
        zoomTo(span > 0 ? min * Math.exp((Number(range.value) / 1000) * span) : min);
      });

      dialog.addEventListener('click', (event) => {
        const zoom = event.target.closest('[data-zoom]');
        if (zoom) zoomTo(zoom.dataset.zoom === 'in' ? scale * 1.2 : scale / 1.2);
        else if (event.target.closest('[data-reset]')) reset();
        else if (event.target.closest('[data-cancel]')) finish(null);
        else if (event.target.closest('[data-use]')) cut();
      });

      async function cut() {
        const canvas = document.createElement('canvas');
        canvas.width = spec.width;
        canvas.height = Math.round(spec.width / spec.aspect);
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        // The window, read back in the photo's own pixels.
        const sx = Math.max(0, -ox / scale);
        const sy = Math.max(0, -oy / scale);
        const sw = Math.min(bitmap.width - sx, vw / scale);
        const sh = Math.min(bitmap.height - sy, vh / scale);
        context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const limit = state.uploads?.maxBytes ?? MAX_UPLOAD_BYTES;
        const blob = await encodeCrop(canvas, limit);
        if (!blob) {
          announce('Cette photo n’a pas pu être préparée. Choisissez-en une autre.', { assertive: true });
          return;
        }
        finish(blob);
      }

      // The window's size comes from the layout, so measure once it is laid out.
      requestAnimationFrame(() => {
        reset();
        view.focus();
      });
      window.addEventListener('resize', reset);
      dialog.addEventListener('close', () => window.removeEventListener('resize', reset), { once: true });
    }
  });
}

// ---------------------------------------------------------------------------
// The photo window: the same simple window for the logo, the main photo,
// categories and products. Photos are saved straight away.

function photoSubject(target, id, slot) {
  if (target === 'venue') {
    return slot === 'logo'
      ? { title: 'Logo', name: `le logo du ${venueLabel}`, shape: 'logo', url: state.venue.logoImageUrl }
      : { title: 'Photo principale', name: `la photo principale du ${venueLabel}`, shape: 'hero', url: state.venue.heroImageUrl };
  }
  const record = target === 'category' ? categoryById(id) : productById(id);
  if (!record) return null;
  return { title: 'Photo', name: record.name, shape: 'arch', url: record.imageUrl, color: colorFor(target === 'category' ? record.id : record.categoryId) };
}

function photoStage(subject, preview = null) {
  const url = preview ?? subject.url;
  const image = url ? `<img src="${esc(url)}" alt=""${preview ? ' class="is-uploading"' : ''}>` : '';
  if (subject.shape === 'logo') return `<span class="stage-logo${url ? ' has-image' : ''}" data-image>${image}</span>`;
  if (subject.shape === 'hero') return `<span class="stage-hero"><span class="band-frame"><span class="band-arch${url ? ' has-image' : ''}" data-image>${image}</span></span></span>`;
  return `<span class="arch arch-ring stage-arch${url ? ' has-image' : ''}" data-image style="--photo-color:${esc(subject.color)}">${image}</span>`;
}

function openPhotoWindow(target, id = null, slot = null, { onChange } = {}) {
  if (!photoSubject(target, id, slot)) return refreshState();
  const uid = nextId('photo');
  let working = false;
  const dialog = mountDialog(`<dialog class="confirm photo-window" aria-labelledby="${uid}-title"><div class="confirm-body" data-body></div><div class="confirm-foot"><button type="button" class="btn btn-secondary btn-large" data-close>Fermer</button></div><input type="file" accept="${Object.keys(IMAGE_TYPES).join(',')}" hidden data-file></dialog>`,
    { onCancel: () => { if (!working) dialog.close(); } });
  const body = dialog.querySelector('[data-body]');
  const file = dialog.querySelector('[data-file]');

  function draw({ status = '', error = '', preview = null, focus = null } = {}) {
    const subject = photoSubject(target, id, slot);
    if (!subject) return dialog.close();
    const uploads = state.uploads ?? { enabled: false, message: 'L’envoi d’images n’est pas configuré.' };
    const off = working ? ' disabled' : '';
    body.innerHTML = `<p class="eyebrow">Menu ${esc(venueLabel)}</p>
      <h2 id="${uid}-title">${esc(subject.title)}${target === 'venue' ? '' : ` de <span lang="fr">${esc(subject.name)}</span>`}</h2>
      <div class="photo-stage">${subject.url && !preview && cropSupported()
        ? `<button type="button" class="photo-recrop" data-recrop${off} aria-label="Recadrer ${esc(subject.title.toLowerCase())}">${photoStage(subject)}<span class="photo-recrop-hint">${icon('crop', 16)} Recadrer</span></button>`
        : photoStage(subject, preview)}</div>
      <p class="photo-status" role="status">${esc(status || (subject.url ? 'Cette photo est affichée dans le menu public.' : 'Aucune photo pour le moment. Le fond coloré est affiché à la place.'))}</p>
      ${error ? `<p class="field-error">${icon('alert', 16)}<span>${esc(error)}</span></p>` : ''}
      ${uploads.enabled ? '' : `<p class="notice notice-warning">${icon('info')}<span><strong>${esc(uploads.message)}</strong> ${esc(uploads.detail ?? '')}</span></p>`}
      <div class="photo-buttons">${uploads.enabled ? `<button type="button" class="btn btn-primary btn-large" data-choose${off}>Choisir une photo</button>` : ''}${subject.url ? `<button type="button" class="btn btn-danger-outline btn-large" data-remove${off}>Supprimer la photo</button>` : ''}</div>
      ${uploads.enabled ? `<p class="hint">Une photo de cet ordinateur ou téléphone (JPEG, PNG ou WebP). Elle est enregistrée immédiatement.${subject.url && cropSupported() ? ' Touchez la photo pour la recadrer ou l’agrandir, autant de fois que vous voulez.' : ''}</p>` : ''}`;
    if (focus) (dialog.querySelector(focus) ?? dialog.querySelector('[data-close]')).focus();
    if (status || error) announce(error || status, { assertive: Boolean(error) });
  }

  // A chosen file is framed before it is sent: the cropper decides what the
  // menu keeps. If this browser cannot crop, the old path still resizes and
  // uploads the whole photo rather than refusing it.
  // A newly chosen file is framed, then both are sent: the crop the menu
  // shows and the whole photo it came from. Keeping the original is what lets
  // the photo be reframed later without cutting a crop out of a crop.
  async function choose(chosen) {
    let display;
    let original;
    try {
      if (!IMAGE_TYPES[chosen.type]) throw new Error(`${quoted(chosen.name)} n’est pas une photo JPEG, PNG ou WebP. Choisissez un autre fichier.`);
      if (chosen.size > MAX_SOURCE_BYTES) throw new Error(`Cette photo est trop volumineuse (${megabytes(chosen.size)}). Choisissez-en une de moins de ${megabytes(MAX_SOURCE_BYTES)}.`);
      const subject = photoSubject(target, id, slot);
      if (!cropSupported()) {
        display = await preparePhoto(chosen);
      } else {
        // The kept original is shrunk to a sensible size first: it only ever
        // has to be large enough to crop from again, never to be published.
        original = await shrinkPhoto(chosen, ORIGINAL_MAX_SIDE);
        display = await openCropper(original, subject?.shape);
        if (!display) return; // Backed out of the cropper: nothing was changed.
      }
      const limit = state.uploads?.maxBytes ?? MAX_UPLOAD_BYTES;
      const total = display.size + (original?.size ?? 0);
      if (total > limit) throw new Error(`Cette photo reste trop volumineuse (${megabytes(total)}). Choisissez-en une plus petite, de moins de ${megabytes(limit)}.`);
    } catch (error) {
      draw({ error: error.message, focus: '[data-choose]' });
      announce(error.message, { assertive: true });
      return;
    }
    upload(display, original);
  }

  // `original` is sent only when a new file was chosen. Left out, the stored
  // original is kept, so reframing never replaces the photo it crops from.
  async function upload(blob, original = null) {
    if (busy) return;
    busy = working = true;
    const preview = URL.createObjectURL(blob);
    draw({ status: 'Envoi de la photo…', preview });
    try {
      const params = new URLSearchParams({ op: 'image.upload', venue, target, ...(id ? { id: String(id) } : {}), ...(slot ? { slot } : {}) });
      const form = new FormData();
      form.append('display', blob, `display.${IMAGE_TYPES[blob.type] ?? 'webp'}`);
      if (original) form.append('original', original, `original.${IMAGE_TYPES[original.type] ?? 'webp'}`);
      const result = await request(`/api/admin?${params}`, {
        method: 'POST',
        // No Content-Type here: the browser adds multipart's own boundary.
        headers: { Accept: 'application/json', 'X-Chichkhan-Admin': '1' },
        body: form,
      });
      state = result.state;
      busy = working = false;
      render();
      onChange?.();
      draw({ status: 'Enregistrée. La nouvelle photo est visible dans le menu public.', focus: '[data-choose]' });
    } catch (error) {
      busy = working = false;
      draw({ error: `La photo n’a pas été modifiée. ${error.message}`, focus: '[data-choose]' });
      if (error.status === 401 || error.code === 'signed-out') reportError(error);
    } finally {
      busy = working = false;
      URL.revokeObjectURL(preview);
    }
  }

  // Crop the photo that is already in use: the console hands the original back
  // from its own address, so it can be reframed as many times as wanted. Each
  // pass starts from the stored photo, so quality is never stacked twice.
  async function recrop() {
    if (busy) return;
    draw({ status: 'Ouverture de la photo…' });
    let original;
    try {
      const params = new URLSearchParams({ op: 'image.source', venue, target, ...(id ? { id: String(id) } : {}), ...(slot ? { slot } : {}) });
      const response = await fetch(`/api/admin?${params}`, { headers: { 'X-Chichkhan-Admin': '1' }, credentials: 'same-origin' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'La photo n’a pas pu être ouverte.');
      }
      original = await response.blob();
    } catch (error) {
      draw({ error: error.message, focus: '[data-recrop]' });
      announce(error.message, { assertive: true });
      return;
    }
    draw();
    const subject = photoSubject(target, id, slot);
    const blob = await openCropper(original, subject?.shape);
    if (!blob) return draw({ focus: '[data-recrop]' });
    const limit = state.uploads?.maxBytes ?? MAX_UPLOAD_BYTES;
    if (blob.size > limit) {
      const message = `Ce recadrage reste trop volumineux (${megabytes(blob.size)}).`;
      draw({ error: message, focus: '[data-recrop]' });
      return announce(message, { assertive: true });
    }
    upload(blob);
  }

  async function remove() {
    const subject = photoSubject(target, id, slot);
    const ok = await confirmDialog({
      title: 'Supprimer cette photo ?',
      body: `<p>La photo de <span class="record" lang="fr">${esc(subject.name)}</span> sera supprimée du menu ${esc(venueLabel)}. Le fond coloré sera affiché à la place.</p>`,
      confirmLabel: 'Supprimer la photo',
    });
    if (!ok) return;
    working = true;
    draw({ status: 'Suppression de la photo…' });
    const result = await mutate('image.remove', { target, id: id ?? undefined, slot: slot ?? undefined }, { working: 'Suppression…', quiet: true });
    working = false;
    // Only refresh a parent edit panel after the server actually changed the
    // image. On failure its unsaved form values must remain untouched.
    if (result) onChange?.();
    draw(result ? { status: 'Supprimée. Le fond coloré est affiché à la place.', focus: '[data-choose]' } : { error: 'La photo n’a pas été supprimée. Réessayez.', focus: '[data-remove]' });
  }


  dialog.addEventListener('click', (event) => {
    if (working) return;
    if (event.target.closest('[data-close]')) dialog.close();
    else if (event.target.closest('[data-choose]')) file.click();
    else if (event.target.closest('[data-recrop]')) recrop();
    else if (event.target.closest('[data-remove]')) remove();
  });
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (chosen) choose(chosen);
  });
  draw({ focus: '[data-choose]' });
}

// In the product and category panels: the current photo and a button that
// opens the photo window; the panel's preview follows along.
function wireInlinePhoto(panel, target, id) {
  const slot = panel.form.querySelector('[data-photo-inline]');
  const draw = () => {
    const subject = photoSubject(target, id, null);
    if (!subject) return;
    slot.innerHTML = `${photoStage(subject)}<button type="button" class="btn btn-secondary" data-inline-photo>Changer la photo</button>`;
  };
  draw();
  slot.addEventListener('click', (event) => {
    if (!event.target.closest('[data-inline-photo]') || busy) return;
    openPhotoWindow(target, id, null, {
      onChange: () => {
        draw();
        panel.form.dispatchEvent(new Event('input'));
      },
    });
  });
}

// ---------------------------------------------------------------------------
// The page header's name and text

const readVenueForm = (form) => {
  const data = new FormData(form);
  return { title: data.get('title'), subtitle: data.get('subtitle'), eyebrow: data.get('eyebrow'), name: data.get('name'), heroImageAlt: data.get('heroImageAlt') };
};

function openVenueTextPanel() {
  const current = state.venue;
  openPanel({
    eyebrow: esc(`Menu ${venueLabel}`),
    title: 'Nom et texte',
    dirtyName: 'le nom et le texte',
    body: `
      ${field({ id: 'v-title', name: 'title', label: 'Nom affiché sur la page', value: current.title, maxlength: LIMITS.venueTitle, lang: 'fr', hint: 'Le grand nom en haut du menu, par exemple « Chichkhan ».' })}
      ${field({ id: 'v-subtitle', name: 'subtitle', label: 'Deuxième ligne', value: current.subtitle, optional: true, maxlength: LIMITS.subtitle, lang: 'fr', hint: 'Affichée en doré sous le nom, par exemple « Café ».' })}
      ${field({ id: 'v-eyebrow', name: 'eyebrow', label: 'Petite ligne au-dessus du nom', value: current.eyebrow, optional: true, maxlength: LIMITS.eyebrow, lang: 'fr', hint: 'Par exemple « Djerba · depuis 2002 ».' })}
      ${field({ id: 'v-name', name: 'name', label: 'Nom complet', value: current.name, maxlength: LIMITS.venueName, lang: 'fr', hint: 'Affiché dans l’onglet du navigateur, en bas du menu et lors du partage du lien, par exemple « Chichkhan Café ».' })}
      ${field({ id: 'v-alt', name: 'heroImageAlt', label: 'Ce que montre la photo principale', value: current.heroImageAlt, optional: true, maxlength: LIMITS.alt, lang: 'fr', hint: 'Lu aux clients aveugles, par exemple « Les arches éclairées de l’entrée, le soir. »' })}
      <section class="form-section"><h3>Aperçu</h3><div class="venue-band band-preview" data-band-preview></div></section>`,
    onInput(form) {
      form.querySelector('[data-band-preview]').innerHTML = bandHtml({ ...state.venue, ...readVenueForm(form) }, { editable: false });
    },
    async onSubmit(form) {
      const values = readVenueForm(form);
      if (!form.validateWith(validateVenueDetails(values).errors)) return null;
      return apiPost('venue.update', values);
    },
  });
}

// ---------------------------------------------------------------------------
// Events on the page

const actions = {
  'category-new': () => openCategoryPanel(null),
  'category-edit': (button) => openCategoryPanel(Number(button.dataset.id)),
  'category-delete': (button) => openCategoryDelete(Number(button.dataset.id)),
  'category-visibility': (button) => mutate('category.visibility', { id: Number(button.dataset.id), isVisible: button.dataset.visible === 'true' }, { button, working: button.dataset.visible === 'true' ? 'Affichage…' : 'Masquage…' }),
  'category-move': (button) => mutate('category.move', { id: Number(button.dataset.id), direction: button.dataset.direction }, { button, working: 'Déplacement…', highlight: `category-${button.dataset.id}` }),
  'product-new': (button) => openProductPanel(null, { categoryId: Number(button.dataset.category) || view.categoryId }),
  'product-edit': (button) => openProductPanel(Number(button.dataset.id)),
  'product-visibility': (button) => mutate('product.visibility', { id: Number(button.dataset.id), isVisible: button.dataset.visible === 'true' }, { button, working: button.dataset.visible === 'true' ? 'Affichage…' : 'Masquage…', highlight: `product-${button.dataset.id}` }),
  'product-move': (button) => mutate('product.move', { id: Number(button.dataset.id), direction: button.dataset.direction }, { button, working: 'Déplacement…', highlight: `product-${button.dataset.id}` }),
  'group-new': () => openGroupDialog(null),
  'group-rename': (button) => openGroupDialog(Number(button.dataset.id)),
  'group-move': (button) => mutate('group.move', { id: Number(button.dataset.id), direction: button.dataset.direction }, { button, working: 'Déplacement…', highlight: `group-${button.dataset.id}` }),
  'group-delete': (button) => openGroupDelete(Number(button.dataset.id)),
  'filters-clear': () => clearFilters(),
  photo: (button) => openPhotoWindow(button.dataset.target, button.dataset.id ? Number(button.dataset.id) : null, button.dataset.slot || null),
  'venue-text': () => openVenueTextPanel(),
  'history-more': () => loadHistory({ append: true }),
};

app.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-nav]');
  if (link && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    const target = link.dataset.nav;
    if (target === 'category') setView(categoryView(Number(link.dataset.id)));
    else if (target === 'all') setView({ ...categoryView(null), all: true });
    else setView({ screen: target });
    return;
  }
  const button = event.target.closest('button[data-action]');
  if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !busy) {
    actions[button.dataset.action]?.(button, event);
  }
});
header.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button && !busy) actions[button.dataset.action]?.(button, event);
});
// A half-finished edit is never lost by accident.
window.addEventListener('beforeunload', (event) => {
  if (activePanel?.isDirty() || busy) {
    event.preventDefault();
    event.returnValue = '';
  }
});

renderFrame();
normalizeView();
history.replaceState(null, '', viewUrl());
render();
