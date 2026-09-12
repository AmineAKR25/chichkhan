import { menus, matches } from "./menu-data.js";
const menu = menus[document.body.dataset.menu];
const search = document.querySelector("#search");
const clear = document.querySelector("#clear-search");
const status = document.querySelector("#search-status");
const empty = document.querySelector("#empty-state");
const sections = [...document.querySelectorAll(".menu-section")];
const links = [...document.querySelectorAll(".category-nav a")];
function filter() {
  const query = search.value.trim();
  let total = 0;
  for (const section of sections) {
    const category = menu.categories.find((c) => c.id === section.id);
    let visible = 0;
    for (const row of section.querySelectorAll(".dish")) {
      const show = matches(
        category.items[Number(row.dataset.index)],
        category.name,
        query,
      );
      row.hidden = !show;
      if (show) visible++;
    }
    section.hidden = visible === 0;
    total += visible;
    section.querySelector(".section-title > span").textContent =
      `${String(visible).padStart(2, "0")} choix`;
    const link = links.find((l) => l.hash === `#${section.id}`);
    link.hidden = visible === 0;
    link.querySelector("span").textContent = String(visible);
  }
  clear.hidden = !query;
  empty.hidden = total > 0;
  status.textContent = query
    ? `${total} résultat${total === 1 ? "" : "s"} dans ${menu.name}`
    : "";
}
function reset() {
  search.value = "";
  filter();
  search.focus();
}
search.addEventListener("input", filter);
clear.addEventListener("click", reset);
document.querySelector("#reset-search").addEventListener("click", reset);
search.addEventListener("keydown", (event) => {
  if (event.key === "Escape") reset();
});
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        for (const link of links) {
          if (link.hash === `#${entry.target.id}`)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        }
      }
    }
  },
  { rootMargin: "-15% 0px -65% 0px" },
);
sections.forEach((section) => observer.observe(section));
// Real anchors keep categories and direct links available without JavaScript.
