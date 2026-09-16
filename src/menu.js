const version = new URL(import.meta.url).search;
const { matches, normalize } = await import(`./search.js${version}`);
const { initSelection } = await import(`./selection.js${version}`);
// Names and prices for search and Ma sélection, embedded by the server from
// the database rows of this venue only.
const menu = JSON.parse(document.querySelector('#menu-data').textContent);
const search = document.querySelector('#search');
const clear = document.querySelector('#clear-search');
const status = document.querySelector('#search-status');
const empty = document.querySelector('#empty-state');
const sections = [...document.querySelectorAll('.menu-section')];
const links = [...document.querySelectorAll('[data-category]')];
const chipRail = document.querySelector('#category-chips');
const dialog = document.querySelector('#category-dialog');
const toggle = document.querySelector('#category-toggle');
const searchToggle = document.querySelector('#search-toggle');
const toolbar = document.querySelector('.menu-tools');
const filter = document.querySelector('#category-filter');
const filterClear = document.querySelector('#clear-category-filter');
const filterEmpty = document.querySelector('.category-filter-empty');
const categories = new Map(menu.categories.map((category) => [category.id, category]));
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const desktop = window.matchMedia('(min-width: 1024px)');
const scrollBehavior = () => (motionPreference.matches ? 'auto' : 'smooth');

// Keep the original text of every name and description so search highlights
// can be removed exactly.
const originals = new Map();
for (const element of document.querySelectorAll('.dish-name, .dish > p')) originals.set(element, element.textContent);

// ---------------------------------------------------------------------------
// Highlighting: map the normalised text back to the original characters, so
// accents and ligatures survive while "creme" still marks "Crème".
const escapeHtml = (value) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function highlight(text, words) {
  let folded = '';
  const origin = [];
  for (let i = 0; i < text.length; i++) {
    const part = normalize(text[i]);
    folded += part;
    for (let j = 0; j < part.length; j++) origin.push(i);
  }
  const marks = new Array(text.length).fill(false);
  for (const word of words) {
    let from = folded.indexOf(word);
    while (word && from !== -1) {
      for (let k = from; k < from + word.length; k++) marks[origin[k]] = true;
      from = folded.indexOf(word, from + word.length);
    }
  }
  let html = '';
  let open = false;
  for (let i = 0; i < text.length; i++) {
    if (marks[i] !== open) {
      html += marks[i] ? '<mark>' : '</mark>';
      open = marks[i];
    }
    html += escapeHtml(text[i]);
  }
  return open ? `${html}</mark>` : html;
}

// ---------------------------------------------------------------------------
// Motion: rows ease into place as they enter the viewport. Transforms only,
// so every dish and description stays readable throughout.
const menuAnimations = new Set();
function cancelMenuMotion() {
  for (const animation of menuAnimations) animation.cancel();
  menuAnimations.clear();
}
const revealObserver = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    let stagger = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting || motionPreference.matches || !entry.target.getClientRects().length) continue;
      revealObserver.unobserve(entry.target);
      const animation = entry.target.animate([{ transform: 'translateY(12px)' }, { transform: 'translate(0)' }], {
        duration: 420,
        delay: Math.min(stagger++ * 35, 140),
        easing: 'cubic-bezier(.16,1,.3,1)',
      });
      menuAnimations.add(animation);
      animation.finished.then(() => menuAnimations.delete(animation), () => menuAnimations.delete(animation));
    }
  }, { threshold: 0.05 }) : null;
function queueMenuMotion() {
  if (!revealObserver || motionPreference.matches) return;
  for (const element of document.querySelectorAll('.section-title,.category-photo,.dish')) revealObserver.observe(element);
}
motionPreference.addEventListener('change', () => {
  cancelMenuMotion();
  revealObserver?.disconnect();
  if (!motionPreference.matches) queueMenuMotion();
});
window.addEventListener('beforeprint', () => {
  cancelMenuMotion();
  revealObserver?.disconnect();
});

// ---------------------------------------------------------------------------
// Scroll-spy: the whole menu scrolls continuously; the rail, sidebar and
// dialog follow the category being read.
let active = menu.categories[0].id;
let spyLockedUntil = 0;
let spyFrame = 0;
function markActive(id, { syncHash = false } = {}) {
  if (!categories.has(id)) return;
  const changed = id !== active;
  active = id;
  for (const link of links) {
    if (link.dataset.category === id) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  const chip = chipRail.querySelector(`[data-category="${id}"]`);
  if (chip && chipRail.scrollWidth > chipRail.clientWidth) {
    chipRail.scrollTo({ left: chip.offsetLeft - (chipRail.clientWidth - chip.offsetWidth) / 2, behavior: scrollBehavior() });
  }
  const sideChip = document.querySelector(`.category-nav [data-category="${id}"]`);
  const nav = document.querySelector('.category-nav');
  if (sideChip && desktop.matches && nav.scrollHeight > nav.clientHeight) {
    const top = sideChip.offsetTop - nav.offsetTop;
    if (top < nav.scrollTop || top + sideChip.offsetHeight > nav.scrollTop + nav.clientHeight)
      nav.scrollTo({ top: top - nav.clientHeight / 2, behavior: scrollBehavior() });
  }
  if (changed && syncHash && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
}
function spy() {
  spyFrame = 0;
  if (performance.now() < spyLockedUntil) return;
  const visible = sections.filter((section) => !section.hidden);
  if (!visible.length) return;
  const line = toolbar.getBoundingClientRect().bottom + 32;
  let current = visible[0];
  for (const section of visible) {
    if (section.getBoundingClientRect().top <= line) current = section;
    else break;
  }
  const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  if (atEnd && window.scrollY > 0) current = visible.at(-1);
  const scrolledIntoMenu = visible[0].getBoundingClientRect().top <= line;
  markActive(current.id, { syncHash: scrolledIntoMenu && !search.value.trim() });
}
const requestSpy = () => { if (!spyFrame) spyFrame = requestAnimationFrame(spy); };
window.addEventListener('scroll', requestSpy, { passive: true });
window.addEventListener('scrollend', () => { spyLockedUntil = 0; requestSpy(); });

function goTo(id, { push = true, instant = false } = {}) {
  closeDialog(false);
  searchOrigin = null;
  if (search.value.trim()) {
    search.value = '';
    render();
  }
  document.body.classList.remove('search-open');
  searchToggle.setAttribute('aria-expanded', 'false');
  searchToggle.setAttribute('aria-label', 'Rechercher dans la carte');
  const heading = id === 'all' ? null : document.querySelector(`#heading-${id}`);
  const target = heading ?? document.querySelector('#menu-sections');
  if (push) {
    const hash = `#${id === 'all' ? 'menu-sections' : id}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
  markActive(id === 'all' ? menu.categories[0].id : id);
  spyLockedUntil = performance.now() + (instant ? 0 : 1200);
  requestAnimationFrame(() => {
    if (heading) {
      heading.focus({ preventScroll: true });
      // Scroll the whole section: on phones the heading sits beside a taller image.
      heading.closest('.menu-section').scrollIntoView({ block: 'start', behavior: instant ? 'instant' : scrollBehavior() });
    } else {
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - toolbar.offsetHeight - 16, behavior: instant ? 'instant' : scrollBehavior() });
    }
  });
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-category]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  goTo(link.dataset.category);
});

// ---------------------------------------------------------------------------
// Search covers the whole menu. Clearing it returns to the category the guest
// was reading when they started typing.
let searchOrigin = null;
function render() {
  cancelMenuMotion();
  const query = search.value.trim();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  let total = 0;
  for (const section of sections) {
    const category = categories.get(section.id);
    let visible = 0;
    for (const row of section.querySelectorAll('.dish')) {
      const show = !query || matches(category.items[Number(row.dataset.index)], category.name, query);
      row.hidden = !show;
      if (show) visible++;
      for (const element of row.querySelectorAll('.dish-name, :scope > p')) {
        if (query && show) element.innerHTML = highlight(originals.get(element), words);
        else if (element.childElementCount) element.textContent = originals.get(element);
      }
    }
    section.hidden = Boolean(query) && visible === 0;
    section.querySelector('.section-title > span').textContent = `${visible} choix${section.hasAttribute('data-compact') ? ' · prix en DT' : ''}`;
    total += visible;
  }
  document.body.classList.toggle('is-searching', Boolean(query));
  document.body.classList.toggle('has-query', Boolean(query));
  clear.hidden = !query;
  empty.hidden = total > 0;
  status.textContent = query ? `${total} résultat${total === 1 ? '' : 's'} dans toute la carte` : '';
}
function onSearchInput() {
  const query = search.value.trim();
  if (query && searchOrigin === null) searchOrigin = { id: active, scrolledIntoMenu: sections[0].getBoundingClientRect().top <= toolbar.getBoundingClientRect().bottom + 32 };
  render();
  if (query) {
    // Bring the first result under the toolbar without jumping past it.
    const menuTop = document.querySelector('#menu-sections').getBoundingClientRect().top + window.scrollY - toolbar.offsetHeight - 12;
    if (window.scrollY > menuTop) window.scrollTo({ top: menuTop, behavior: 'instant' });
  } else {
    restoreOrigin();
  }
  requestSpy();
}
function restoreOrigin() {
  const origin = searchOrigin;
  searchOrigin = null;
  if (origin?.scrolledIntoMenu) {
    spyLockedUntil = performance.now() + 200;
    markActive(origin.id);
    requestAnimationFrame(() => document.querySelector(`#heading-${origin.id}`).closest('.menu-section').scrollIntoView({ block: 'start', behavior: 'instant' }));
  }
}
function reset() {
  search.value = '';
  onSearchInput();
  search.focus();
}
search.addEventListener('input', onSearchInput);
clear.addEventListener('click', reset);
document.querySelector('#reset-search').addEventListener('click', reset);
search.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (search.value) reset();
  else setSearchOpen(false);
});

// Suggested ingredients: pointerdown keeps focus in the field so the list does
// not disappear before the tap lands (Safari does not focus buttons on click).
const suggestions = document.querySelector('#search-suggestions');
suggestions?.addEventListener('pointerdown', (event) => event.preventDefault());
suggestions?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-suggest]');
  if (!button) return;
  search.value = button.dataset.suggest;
  onSearchInput();
  search.focus();
});

// On phones and tablets the search field opens from the rail.
function setSearchOpen(open) {
  document.body.classList.toggle('search-open', open);
  searchToggle.setAttribute('aria-expanded', String(open));
  searchToggle.setAttribute('aria-label', open ? 'Fermer la recherche' : 'Rechercher dans la carte');
  if (open) search.focus({ preventScroll: true });
  else {
    if (search.value) {
      search.value = '';
      onSearchInput();
    }
    if (!desktop.matches) searchToggle.focus({ preventScroll: true });
  }
}
searchToggle.addEventListener('click', () => setSearchOpen(!document.body.classList.contains('search-open')));

// ---------------------------------------------------------------------------
// Category dialog with its own filter.
function closeDialog(restoreFocus = true) {
  if (!dialog.open) return;
  dialog.close();
  toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle.focus({ preventScroll: true });
}
function filterCategories() {
  const query = normalize(filter.value.trim());
  let total = 0;
  for (const link of dialog.querySelectorAll('[data-category]')) {
    if (link.dataset.category === 'all') { link.hidden = Boolean(query); continue; }
    const name = categories.get(link.dataset.category).name;
    const show = query.split(/\s+/).every((word) => normalize(name).includes(word));
    link.hidden = !show;
    if (show) total++;
  }
  for (const group of dialog.querySelectorAll('.nav-group')) group.hidden = !group.querySelector('a:not([hidden])');
  filterClear.hidden = !query;
  filterEmpty.hidden = total > 0;
  document.querySelector('#category-filter-status').textContent = query ? `${total} catégorie${total === 1 ? '' : 's'}` : '';
}
function resetFilter() {
  filter.value = '';
  filterCategories();
  filter.focus();
}
filter.addEventListener('input', filterCategories);
filterClear.addEventListener('click', resetFilter);
document.querySelector('#reset-category-filter').addEventListener('click', resetFilter);
toggle.addEventListener('click', () => {
  filter.value = '';
  filterCategories();
  dialog.showModal();
  toggle.setAttribute('aria-expanded', 'true');
  document.querySelector('#close-categories').focus({ preventScroll: true });
  dialog.scrollTop = 0;
  dialog.querySelector('[aria-current]')?.scrollIntoView({ block: 'center', behavior: 'instant' });
});
document.querySelector('#close-categories').addEventListener('click', () => closeDialog());
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
});
for (const modal of document.querySelectorAll('dialog')) {
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button,input,a[href]')].filter((element) => element.getClientRects().length > 0 && !element.disabled);
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  });
}

// ---------------------------------------------------------------------------
// History and keyboard.
function restoreLocation() {
  const hash = location.hash.slice(1);
  if (hash === 'main' || hash === '') return;
  if (hash === 'menu-sections') goTo('all', { push: false, instant: true });
  else if (categories.has(hash)) goTo(hash, { push: false, instant: true });
}
window.addEventListener('popstate', restoreLocation);
window.addEventListener('hashchange', restoreLocation);
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgentData?.platform ?? navigator.platform);
document.querySelector('.search-box kbd').textContent = isMac ? '⌘ K' : 'Ctrl K';
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    closeDialog(false);
    setSearchOpen(true);
  }
});

// Measure the sticky toolbar so wrapping, zoom and the open search panel never
// leave a focused category heading underneath it.
const updateInsets = () => document.documentElement.style.setProperty('--tools-offset', `${toolbar.getBoundingClientRect().height}px`);

render();
initSelection(menu);
document.body.classList.add('enhanced');
document.documentElement.classList.remove('menu-boot');
updateInsets();
new ResizeObserver(updateInsets).observe(toolbar);
markActive(menu.categories[0].id);
queueMenuMotion();
if (categories.has(location.hash.slice(1)) || location.hash === '#menu-sections') restoreLocation();
else requestSpy();
