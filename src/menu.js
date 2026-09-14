const { menus, matches, normalize } = await import(`./menu-data.js${new URL(import.meta.url).search}`);
const menu = Object.values(menus).find((entry) => entry.slug === document.body.dataset.menu);
const search = document.querySelector('#search');
const clear = document.querySelector('#clear-search');
const status = document.querySelector('#search-status');
const empty = document.querySelector('#empty-state');
const sections = [...document.querySelectorAll('.menu-section')];
const links = [...document.querySelectorAll('[data-category]')];
const dialog = document.querySelector('#category-dialog');
const toggle = document.querySelector('#category-toggle');
const pagination = document.querySelector('#category-pagination');
const previousLink = document.querySelector('#previous-category');
const nextLink = document.querySelector('#next-category');
const filter = document.querySelector('#category-filter');
const filterClear = document.querySelector('#clear-category-filter');
const filterEmpty = document.querySelector('.category-filter-empty');
const categories = new Map(menu.categories.map((category) => [category.id, category]));
function fromHash() {
  const hash = location.hash.slice(1);
  if (hash === 'menu-sections') return 'all';
  return categories.has(hash) ? hash : menu.categories[0].id;
}
let selected = fromHash();
function render() {
  const query = search.value.trim();
  let total = 0;
  for (const section of sections) {
    const category = categories.get(section.id);
    let visible = 0;
    for (const row of section.querySelectorAll('.dish')) {
      const show = !query || matches(category.items[Number(row.dataset.index)], category.name, query);
      row.hidden = !show;
      if (show) visible++;
    }
    section.hidden = query ? visible === 0 : selected !== 'all' && selected !== section.id;
    section.querySelector('.section-title > span').textContent = `${visible} choix`;
    if (!section.hidden) total += visible;
  }
  for (const link of links) {
    if (!query && link.dataset.category === selected) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  document.body.classList.toggle('is-searching', Boolean(query));
  document.querySelector('#current-category').textContent = query ? 'Résultats de recherche' : selected === 'all' ? 'Toute la carte' : categories.get(selected).name;
  clear.hidden = !query;
  empty.hidden = total > 0;
  status.textContent = query ? `${total} résultat${total === 1 ? '' : 's'} dans toute la carte` : '';
  pagination.hidden = Boolean(query) || selected === 'all';
  if (selected !== 'all') {
    const index = menu.categories.findIndex((category) => category.id === selected);
    const previous = menu.categories[index - 1];
    const next = menu.categories[index + 1];
    setPaginationLink(previousLink, previous, 'Catégorie précédente');
    setPaginationLink(nextLink, next, 'Catégorie suivante');
  }
}
function setPaginationLink(link, category, label) {
  link.href = `#${category?.id ?? 'menu-sections'}`;
  link.dataset.category = category?.id ?? 'all';
  link.querySelector('small').textContent = category ? label : 'Explorer';
  link.querySelector('span > span').textContent = category?.name ?? 'Toute la carte';
}
function focusSection() {
  const heading = document.querySelector(`#heading-${selected === 'all' ? menu.categories[0].id : selected}`);
  requestAnimationFrame(() => {
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
}
function closeDialog(restoreFocus = true) {
  if (!dialog.open) return;
  dialog.close();
  toggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toggle.focus({ preventScroll: true });
}
function selectCategory(id, push = true) {
  if (id !== 'all' && !categories.has(id)) return;
  selected = id;
  search.value = '';
  closeDialog(false);
  if (push) {
    const hash = `#${id === 'all' ? 'menu-sections' : id}`;
    if (location.hash !== hash) history.pushState(null, '', hash);
  }
  render();
  focusSection();
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-category]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  selectCategory(link.dataset.category);
});
function reset() {
  search.value = '';
  render();
  search.focus();
}
search.addEventListener('input', render);
clear.addEventListener('click', reset);
document.querySelector('#reset-search').addEventListener('click', reset);
search.addEventListener('keydown', (event) => { if (event.key === 'Escape') reset(); });
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
  // Start at the title without opening a phone keyboard or scrolling past the filter.
  document.querySelector('#close-categories').focus({ preventScroll: true });
  dialog.scrollTop = 0;
});
document.querySelector('#close-categories').addEventListener('click', () => closeDialog());
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeDialog(); });
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
});
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll('button,input,a[href]')].filter((element) => element.getClientRects().length > 0 && !element.disabled);
  if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
  else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
});
function restoreLocation() {
  if (location.hash === '#main') return;
  const target = fromHash();
  if (target !== selected || search.value) selectCategory(target, false);
}
window.addEventListener('popstate', restoreLocation);
window.addEventListener('hashchange', restoreLocation);
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    closeDialog(false);
    search.focus();
  }
});
// Measure actual sticky controls so wrapping labels, zoom and landscape never
// leave the focused category heading underneath navigation.
const header = document.querySelector('.site-header');
const toolbar = document.querySelector('.menu-tools');
const updateInsets = () => {
  document.documentElement.style.setProperty('--header-offset', `${header.getBoundingClientRect().height}px`);
  document.documentElement.style.setProperty('--tools-offset', `${toolbar.getBoundingClientRect().height}px`);
};
render();
document.body.classList.add('enhanced');
document.documentElement.classList.remove('menu-boot');
updateInsets();
const resizeObserver = new ResizeObserver(updateInsets);
resizeObserver.observe(header);
resizeObserver.observe(toolbar);
if (location.hash && location.hash !== '#main') focusSection();
