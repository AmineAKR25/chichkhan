const { menus, matches } = await import(
  `./menu-data.js${new URL(import.meta.url).search}`
);

const menu = Object.values(menus).find(
  (entry) => entry.slug === document.body.dataset.menu,
);
const search = document.querySelector("#search");
const clear = document.querySelector("#clear-search");
const status = document.querySelector("#search-status");
const empty = document.querySelector("#empty-state");
const sections = [...document.querySelectorAll(".menu-section")];
const links = [...document.querySelectorAll("[data-category]")];
const dialog = document.querySelector("#category-dialog");
const toggle = document.querySelector("#category-toggle");
const pagination = document.querySelector("#category-pagination");
const nextLink = document.querySelector("#next-category");
const categories = new Map(
  menu.categories.map((category) => [category.id, category]),
);
function fromHash() {
  const hash = location.hash.slice(1);
  if (hash === "menu-sections") return "all";
  return categories.has(hash) ? hash : menu.categories[0].id;
}
let selected = fromHash();
let searching = false;
const detailStates = new Map();

function render() {
  const query = search.value.trim();
  if (query && !searching) {
    document
      .querySelectorAll(".dish details")
      .forEach((detail) => detailStates.set(detail, detail.open));
  }
  if (!query && searching) {
    detailStates.forEach((open, detail) => {
      detail.open = open;
    });
    detailStates.clear();
  }
  searching = Boolean(query);
  let total = 0;
  for (const section of sections) {
    const category = categories.get(section.id);
    let visible = 0;
    for (const row of section.querySelectorAll(".dish")) {
      const show =
        !query ||
        matches(
          category.items[Number(row.dataset.index)],
          category.name,
          query,
        );
      row.hidden = !show;
      if (query && show && row.querySelector("details"))
        row.querySelector("details").open = true;
      if (show) visible++;
    }
    section.hidden = query
      ? visible === 0
      : selected !== "all" && selected !== section.id;
    section.querySelector(".section-title > span").textContent =
      `${visible} choix`;
    if (!section.hidden) total += visible;
  }
  for (const link of links) {
    if (!query && link.dataset.category === selected)
      link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
  document.body.classList.toggle("is-searching", Boolean(query));
  document.querySelector("#current-category").textContent = query
    ? "Résultats de recherche"
    : selected === "all"
      ? "Toute la carte"
      : categories.get(selected).name;
  clear.hidden = !query;
  empty.hidden = total > 0;
  status.textContent = query
    ? `${total} résultat${total === 1 ? "" : "s"} dans toute la carte ${menu.name}`
    : "";
  pagination.hidden = Boolean(query) || selected === "all";
  if (selected !== "all") {
    const index = menu.categories.findIndex(
      (category) => category.id === selected,
    );
    const next = menu.categories[(index + 1) % menu.categories.length];
    nextLink.href = `#${next.id}`;
    nextLink.dataset.category = next.id;
    nextLink.querySelector("span").textContent = next.name;
  }
}
function focusSection() {
  const heading = document.querySelector(
    `#heading-${selected === "all" ? menu.categories[0].id : selected}`,
  );
  requestAnimationFrame(() => {
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "instant" });
  });
}
function selectCategory(id, push = true) {
  if (id !== "all" && !categories.has(id)) return;
  selected = id;
  search.value = "";
  if (dialog.open) dialog.close();
  if (push) {
    const hash = `#${id === "all" ? "menu-sections" : id}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
  render();
  focusSection();
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-category]");
  if (
    !link ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  selectCategory(link.dataset.category);
});
function reset() {
  search.value = "";
  render();
  search.focus();
}
search.addEventListener("input", render);
clear.addEventListener("click", reset);
document.querySelector("#reset-search").addEventListener("click", reset);
search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") reset();
});
toggle.addEventListener("click", () => {
  dialog.showModal();
  const current =
    dialog.querySelector('[aria-current="location"]') ??
    dialog.querySelector("a");
  current.focus();
});
document
  .querySelector("#close-categories")
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
// Escape and backdrop dismissal never reach a handler of ours, and the close
// event is not dependable, so mirror the open attribute itself.
new MutationObserver(() => {
  toggle.setAttribute("aria-expanded", String(dialog.open));
}).observe(dialog, { attributes: true, attributeFilter: ["open"] });
dialog.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;
  const controls = [...dialog.querySelectorAll("button, a[href]")];
  if (event.shiftKey && document.activeElement === controls[0]) {
    event.preventDefault();
    controls.at(-1).focus();
  } else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
    event.preventDefault();
    controls[0].focus();
  }
});
function restoreLocation() {
  if (location.hash === "#main") return;
  const target = fromHash();
  if (target !== selected || search.value) selectCategory(target, false);
}
window.addEventListener("popstate", restoreLocation);
window.addEventListener("hashchange", restoreLocation);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (dialog.open) dialog.close();
    search.focus();
  }
});
// Progressive enhancement: native anchors and all content work without this module.
// The inline head script has already revealed the toolbar and the first category.
document.body.classList.add("enhanced");
render();
if (location.hash && location.hash !== "#main") focusSection();
