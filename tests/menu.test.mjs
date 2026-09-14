import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { menus, matches } from "../src/menu-data.js";
const root = new URL("../dist/", import.meta.url);
const find = (id, query) =>
  menus[id].categories.flatMap((c) =>
    c.items.filter((i) => matches(i, c.name, query)),
  );

test("each route is self-contained and carries the entrance hero", () => {
  const names = Object.values(menus).map((m) => m.name);
  for (const menu of Object.values(menus)) {
    const html = readFileSync(new URL(`${menu.slug}/index.html`, root), "utf8");
    for (const other of names.filter((n) => n !== menu.name))
      assert.ok(!html.includes(other), `${menu.slug} names ${other}`);
    for (const slug of ["restaurant", "cafe", "menu-1", "menu-2"])
      if (slug !== menu.slug)
        assert.ok(!html.includes(`/${slug}`), `${menu.slug} links to /${slug}`);
    assert.ok(!/href="\/"/.test(html), "no link back to a homepage");
    assert.ok(html.includes('class="hero-photo"'));
    assert.ok(html.includes(`alt="${menu.heroAlt.replace(/'/g, "&#39;")}"`));
  }
});
test("both catalogues retain their category and item totals", () => {
  assert.deepEqual(
    Object.values(menus).map((m) => [
      m.categories.length,
      m.categories.reduce((n, c) => n + c.items.length, 0),
    ]),
    [
      [11, 73],
      [20, 150],
    ],
  );
});
test("overlapping pizza names retain the separate menu prices", () => {
  assert.equal(find(1, "Margherita")[0].price, 19);
  assert.equal(find(2, "Margherita")[0].price, 15);
});
test("search handles accents, uppercase ligatures and multiple ingredient words", () => {
  assert.equal(find(2, "BŒUF EFFILOCHE").length, 2);
  assert.ok(find(2, "crepe salee").length > 0);
  assert.equal(find(1, "pesto burrata").length, 1);
  assert.equal(find(2, "pesto burrata").length, 0);
  assert.equal(find(2, "zzzzzz").length, 0);
});
test("search matches an apostrophe typed as a straight quote or left out", () => {
  // The catalogue spells these with U+2019; a phone keyboard types U+0027.
  for (const query of ["Côte à l’os", "Côte à l'os", "cote a los"])
    assert.equal(find(1, query).length, 1, `no match for ${query}`);
  // "Le Healthy" is only reachable through its description.
  for (const query of ["toast d’avocat", "toast d'avocat", "toast davocat"])
    assert.equal(find(2, query).length, 1, `no match for ${query}`);
});
test("static output includes every item, price, description and category image", () => {
  for (const menu of Object.values(menus)) {
    const html = readFileSync(new URL(`${menu.slug}/index.html`, root), "utf8");
    const encoded = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    assert.equal(
      (html.match(/class="category-photo"/g) || []).length,
      menu.categories.length,
    );
    assert.equal(
      (html.match(/class="dish"/g) || []).length,
      menu.categories.flatMap((c) => c.items).length,
    );
    for (const category of menu.categories) {
      const section = html
        .split(`class="menu-section" id="${category.id}"`)[1]
        .split("</section>")[0];
      assert.ok(
        section.indexOf("</h2>") < section.indexOf('class="category-photo"'),
      );
      for (const item of category.items) {
        assert.ok(section.includes(encoded(item.name)));
        assert.ok(
          section.includes(
            item.price.toLocaleString("fr-TN", {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            }),
          ),
        );
        if (item.description)
          assert.ok(section.includes(encoded(item.description)));
      }
    }
  }
});

test("dish descriptions remain visible without an expansion control", () => {
  for (const menu of Object.values(menus)) {
    const html = readFileSync(new URL(`${menu.slug}/index.html`, root), "utf8");
    assert.ok(!/<details\b|<summary\b/.test(html), `${menu.slug} hides a description in a disclosure`);
    const descriptions = menu.categories.flatMap((cat) => cat.items).filter((item) => item.description);
    const rows = [...html.matchAll(/<article class="dish"[^>]*>([\s\S]*?)<\/article>/g)].map((match) => match[1]);
    assert.equal(rows.filter((row) => /<p>/.test(row)).length, descriptions.length);
    assert.ok(rows.every((row) => !/<p[^>]+(?:hidden|line-clamp|aria-hidden)/.test(row)));
  }
});

test("both category directories preserve every category exactly once", () => {
  for (const menu of Object.values(menus)) {
    const html = readFileSync(new URL(`${menu.slug}/index.html`, root), "utf8");
    for (const className of ['category-nav', 'dialog-categories']) {
      const nav = html.match(new RegExp(`<nav[^>]*class="${className}"[^>]*>([\\s\\S]*?)</nav>`))[1];
      const ids = [...nav.matchAll(/data-category="([^"]+)"/g)].map((match) => match[1]);
      assert.deepEqual(ids, ['all', ...menu.categories.map((category) => category.id)]);
    }
  }
});
