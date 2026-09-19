import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matches } from "../src/search.js";
import { shapeMenu } from "../lib/db.js";
import { imageUrl } from "../lib/images.js";
import { renderMenuPage, suggestionsFor, money } from "../lib/render.js";
import { handleMenuRequest } from "../lib/handler.js";
import { catalogue, rows } from "./helpers/catalogue.mjs";

const restaurant = catalogue("restaurant");
const cafe = catalogue("cafe");
const menus = { restaurant, cafe };
const find = (menu, query) => menu.categories.flatMap((c) => c.items.filter((i) => matches(i, c.name, query)));
const encoded = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

// --- Database schema and seed ------------------------------------------------

test("the schema separates venues with an enum and venue-scoped foreign keys", () => {
  assert.match(schema, /create type venue as enum \('restaurant', 'cafe'\)/);
  assert.match(schema, /foreign key \(venue, category_id\) references categories \(venue, id\)/);
  assert.match(schema, /foreign key \(venue, group_id\) references category_groups \(venue, id\)/);
  assert.match(schema, /price_millimes\s+integer not null check \(price_millimes >= 0\)/);
});

test("the seed keeps both catalogues complete", () => {
  assert.deepEqual(
    Object.values(menus).map((m) => [m.categories.length, m.categories.reduce((n, c) => n + c.items.length, 0)]),
    [[11, 73], [20, 150]],
  );
  assert.equal(rows.items.filter((i) => i.category_id === undefined).length, 0, "every item finds its category");
  assert.equal(rows.categories.filter((c) => c.group_id === null).length, 0, "every category finds its group");
  assert.deepEqual(Object.values(menus).map((m) => m.categories.flatMap((c) => c.items).filter((i) => i.isHouse).length), [4, 9]);
});

test("overlapping pizza names retain the separate venue prices", () => {
  assert.equal(find(restaurant, "Margherita")[0].millimes, 19000);
  assert.equal(find(cafe, "Margherita")[0].millimes, 15000);
});

// --- Search ---------------------------------------------------------------------

test("search handles accents, uppercase ligatures and multiple ingredient words", () => {
  assert.equal(find(cafe, "BŒUF EFFILOCHE").length, 2);
  assert.ok(find(cafe, "crepe salee").length > 0);
  assert.equal(find(restaurant, "pesto burrata").length, 1);
  assert.equal(find(cafe, "pesto burrata").length, 0);
  assert.equal(find(cafe, "zzzzzz").length, 0);
});

test("search matches an apostrophe typed as a straight quote or left out", () => {
  for (const query of ["Côte à l’os", "Côte à l'os", "cote a los"])
    assert.equal(find(restaurant, query).length, 1, `no match for ${query}`);
  for (const query of ["toast d’avocat", "toast d'avocat", "toast davocat"])
    assert.equal(find(cafe, query).length, 1, `no match for ${query}`);
});

test("search suggestions come from the venue's own menu and each finds several dishes", () => {
  for (const menu of Object.values(menus)) {
    const words = suggestionsFor(menu.categories);
    assert.ok(words.length >= 4, `${menu.venue.slug} has ${words.length} suggestions`);
    for (const word of words) assert.ok(find(menu, word).length >= 3, `${menu.venue.slug}: ${word}`);
  }
});

// --- Rendering --------------------------------------------------------------------

test("each page names only its own venue and links nowhere else", () => {
  for (const [slug, menu] of Object.entries(menus)) {
    const html = renderMenuPage(menu);
    const other = Object.values(menus).find((m) => m !== menu).venue.name;
    assert.ok(!html.includes(other), `${slug} names ${other}`);
    for (const route of ["restaurant", "cafe", "menu-1", "menu-2"])
      if (route !== slug) assert.ok(!html.includes(`/${route}`), `${slug} links to /${route}`);
    assert.ok(!/href="\/"/.test(html), "no link back to a homepage");
    assert.ok(html.includes(`data-menu="${slug}"`));
  }
});

test("pages include every item, price, description and a placeholder per category", () => {
  for (const menu of Object.values(menus)) {
    const html = renderMenuPage(menu);
    assert.equal((html.match(/class="category-photo"/g) || []).length, menu.categories.length);
    assert.equal((html.match(/class="dish"/g) || []).length, menu.categories.flatMap((c) => c.items).length);
    for (const category of menu.categories) {
      const section = html.split(`class="menu-section" id="${category.slug}"`)[1].split("</section>")[0];
      const text = section.replace(/<[^>]+>/g, "");
      assert.ok(section.indexOf("</h2>") < section.indexOf('class="category-photo'));
      for (const item of category.items) {
        assert.ok(section.includes(encoded(item.name)));
        assert.ok(text.includes(money(item.millimes)));
        if (item.description) assert.ok(section.includes(encoded(item.description)));
      }
    }
  }
});

test("dish descriptions remain visible without an expansion control", () => {
  for (const menu of Object.values(menus)) {
    const html = renderMenuPage(menu);
    assert.ok(!/<details\b|<summary\b/.test(html));
    const described = menu.categories.flatMap((c) => c.items).filter((i) => i.description);
    const rows = [...html.matchAll(/<article class="dish"[^>]*>([\s\S]*?)<\/article>/g)].map((m) => m[1]);
    assert.equal(rows.filter((row) => /<p>/.test(row)).length, described.length);
  }
});

test("category directories and the rail list every category once, in order", () => {
  for (const menu of Object.values(menus)) {
    const html = renderMenuPage(menu);
    const ids = menu.categories.map((c) => c.slug);
    for (const className of ["category-nav", "dialog-categories"]) {
      const nav = html.match(new RegExp(`<nav[^>]*class="${className}"[^>]*>([\\s\\S]*?)</nav>`))[1];
      assert.deepEqual([...nav.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]), ["all", ...ids]);
    }
    const rail = html.match(/<nav[^>]*class="category-chips"[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...rail.matchAll(/data-category="([^"]+)"/g)].map((m) => m[1]), ids);
  }
});

test("categories without descriptions render as a compact price list", () => {
  for (const menu of Object.values(menus)) {
    const html = renderMenuPage(menu);
    for (const category of menu.categories) {
      const section = html.split(`class="menu-section" id="${category.slug}"`)[1].split("</section>")[0];
      assert.equal(section.includes('class="dish-grid is-compact"'), category.items.every((i) => !i.description));
    }
  }
});

test("the embedded data is this venue's only and cannot close its script tag", () => {
  const hostile = shapeMenu(
    [{ slug: "cafe", name: "Café", title: "Café", hero_focus_y: 50 }], [],
    [{ id: 1, group_id: null, slug: "x", name: "</script><b>", note: "", image_key: null }],
    [{ id: 7, category_id: 1, name: "</script>", description: "", price_millimes: 1000, is_house: false }],
  );
  const html = renderMenuPage(hostile);
  const json = html.match(/<script type="application\/json" id="menu-data">([\s\S]*?)<\/script>/)[1];
  assert.ok(!json.includes("<"));
  assert.equal(JSON.parse(json).categories[0].items[0].name, "</script>");
  assert.equal(JSON.parse(renderMenuPage(cafe).match(/id="menu-data">([\s\S]*?)<\/script>/)[1]).categories.length, 20);
});

// --- Images from Cloudflare R2 ------------------------------------------------------

test("image URLs are built from the R2 base and a safe object key", () => {
  assert.equal(imageUrl("https://images.example.com", "categories/cafe/glaces.webp"), "https://images.example.com/categories/cafe/glaces.webp");
  assert.equal(imageUrl("https://images.example.com/menu/", "a b/é.webp"), "https://images.example.com/menu/a%20b/%C3%A9.webp");
  assert.equal(imageUrl("http://localhost:9000", "x.webp"), "http://localhost:9000/x.webp");
  for (const [base, key] of [[undefined, "x.webp"], ["https://images.example.com", null], ["not a url", "x.webp"], ["http://images.example.com", "x.webp"], ["https://images.example.com", "../x.webp"], ["https://images.example.com", "/x.webp"]])
    assert.equal(imageUrl(base, key), null, `${base} ${key}`);
});

test("without images every frame keeps its coloured placeholder", () => {
  const html = renderMenuPage(cafe, { imageBaseUrl: "https://images.example.com" });
  assert.ok(!/<img/.test(html));
  assert.equal((html.match(/--photo-color:#/g) || []).length, 20);
});

test("with R2 configured, images render and fall back to the placeholder on error", () => {
  const html = renderMenuPage(catalogue("cafe", { imageKeys: true }), { imageBaseUrl: "https://images.example.com" });
  assert.ok(html.includes('src="https://images.example.com/venues/cafe/hero.webp"'));
  assert.ok(html.includes('src="https://images.example.com/venues/cafe/logo.webp"'));
  assert.ok(html.includes('src="https://images.example.com/categories/cafe/glaces.webp"'));
  assert.equal((html.match(/class="category-photo has-image"/g) || []).length, 20);
  assert.equal((html.match(/<img[^>]+onerror=/g) || []).length, 22);
  // The photo is already cropped to the frame, so nothing repositions it.
  assert.ok(!html.includes("object-position"), "the header shows the crop itself");
  assert.ok(html.includes('<link rel="preconnect" href="https://images.example.com">'));
  assert.ok(!renderMenuPage(cafe).includes("preconnect"), "no preconnect without images");
});

test("a product photo sits in a small arch over its placeholder, only when it has a key", () => {
  const menu = catalogue("cafe");
  const [first, second] = menu.categories[0].items;
  first.imageKey = "products/cafe/1-0123456789.webp";
  const html = renderMenuPage(menu, { imageBaseUrl: "https://images.example.com" });
  const row = html.match(new RegExp(`<article class="dish has-photo" data-index="0" data-item-id="${first.id}">[\\s\\S]*?</article>`))[0];
  assert.match(row, /<span class="dish-photo has-image" data-image style="--photo-color:#[0-9a-f]{6}" aria-hidden="true"><img src="https:\/\/images\.example\.com\/products\/cafe\/1-0123456789\.webp" alt="" loading="lazy" decoding="async" onerror=/);
  assert.equal((html.match(/class="dish-photo/g) || []).length, 1);
  assert.ok(html.includes(`<article class="dish" data-index="1" data-item-id="${second.id}">`));
  // Without the R2 base URL there is no photo and no empty frame.
  assert.ok(!renderMenuPage(menu).includes("dish-photo"));
});

test("categories follow their group's order, so the page matches its navigation", () => {
  const menu = shapeMenu(
    [{ slug: "cafe", name: "Café", title: "Café", hero_focus_y: 50 }],
    [{ id: 2, name: "À boire" }, { id: 1, name: "Pour commencer" }],
    [
      { id: 10, group_id: 1, slug: "petit-dej", name: "Petit déjeuner", note: "", image_key: null },
      { id: 11, group_id: null, slug: "divers", name: "Divers", note: "", image_key: null },
      { id: 12, group_id: 2, slug: "jus", name: "Jus", note: "", image_key: null },
    ],
    [10, 11, 12].map((category, i) => ({ id: i + 1, category_id: category, name: `Item ${i}`, description: "", price_millimes: 1000, is_house: false })),
  );
  assert.deepEqual(menu.categories.map((c) => c.slug), ["jus", "petit-dej", "divers"]);
  const html = renderMenuPage(menu);
  const sectionOrder = [...html.matchAll(/class="menu-section" id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sectionOrder, ["jus", "petit-dej", "divers"]);
});

// --- Request handling ---------------------------------------------------------------

test("the venue comes from the URL and is the only venue queried", async () => {
  const asked = [];
  const response = await handleMenuRequest("cafe", { env: { DATABASE_URL: "postgres://x" }, load: async (venue) => (asked.push(venue), cafe) });
  assert.deepEqual(asked, ["cafe"]);
  assert.equal(response.status, 200);
  assert.match(response.headers["Cache-Control"], /s-maxage=60/);
  assert.ok(response.body.includes("Chichkhan"));
});

test("an unknown venue is a 404 and never reaches the database", async () => {
  let called = false;
  for (const venue of ["bar", "", null, "cafe;drop table venues"]) {
    const response = await handleMenuRequest(venue, { load: async () => { called = true; } });
    assert.equal(response.status, 404);
  }
  assert.equal(called, false);
});

test("without a database connection nothing from the menu is shown", async () => {
  const names = Object.values(menus).flatMap((m) => [m.venue.name, ...m.categories.map((c) => c.name)]);
  const original = console.error;
  console.error = () => {};
  try {
    for (const env of [{}, { DATABASE_URL: "not-a-connection-string" }]) {
      const response = await handleMenuRequest("restaurant", { env });
      assert.equal(response.status, 503);
      assert.equal(response.headers["Cache-Control"], "no-store");
      for (const name of names) assert.ok(!response.body.includes(encoded(name)), `shows ${name}`);
      assert.ok(!/class="dish"|menu-data|category-photo/.test(response.body));
    }
    const failing = await handleMenuRequest("cafe", { env: { DATABASE_URL: "postgres://x" }, load: async () => { throw new Error("timeout"); } });
    assert.equal(failing.status, 503);
  } finally {
    console.error = original;
  }
});

test("a venue missing from the database is a 404; an empty venue shows no products", async () => {
  assert.equal((await handleMenuRequest("cafe", { load: async () => null })).status, 404);
  const empty = shapeMenu([{ slug: "cafe", name: "Chichkhan Café", title: "Chichkhan", hero_focus_y: 17 }], [], [{ id: 1, group_id: null, slug: "vide", name: "Vide", note: "", image_key: null }], []);
  assert.equal(empty.categories.length, 0);
  const html = renderMenuPage(empty);
  assert.ok(html.includes("La carte arrive bientôt."));
  assert.ok(!/class="dish"|menu-data/.test(html));
});

// --- Footer ------------------------------------------------------------------

const footerOf = (menu) => renderMenuPage(menu).match(/<footer>[\s\S]*?<\/footer>/)[0];

test("the footer carries the venue's own details and links out safely", () => {
  for (const [slug, menu] of Object.entries(menus)) {
    const footer = footerOf(menu);
    const { venue } = menu;
    // The ask comes first, then where we are, then where to follow us.
    assert.match(footer, /Votre avis[\s\S]*Nous trouver[\s\S]*Nous suivre/, slug);
    for (const text of [venue.address, venue.hours, venue.phone]) assert.ok(footer.includes(encoded(text)), `${slug}: ${text}`);
    for (const href of [venue.mapsUrl, venue.reviewUrl, venue.instagramUrl, venue.facebookUrl]) {
      assert.ok(footer.includes(`href="${encoded(href)}"`), `${slug}: ${href}`);
    }
    // Anything leaving the site opens away from the menu and cannot reach back.
    for (const [, attrs] of footer.matchAll(/<a ([^>]*href="https?:[^>]*)>/g)) {
      assert.match(attrs, /target="_blank"/, attrs);
      assert.match(attrs, /rel="noopener"/, attrs);
    }
    // The guest reads a spaced number; the dialler is handed digits only.
    assert.ok(footer.includes('href="tel:+21675765793"'), slug);
    assert.ok(footer.includes(">+216 75 765 793<"), "the printed number keeps its spaces");
  }
});

test("a venue with no contact details still renders a footer", () => {
  const menu = structuredClone(cafe);
  for (const key of ["address", "phone", "hours", "mapsUrl", "reviewUrl", "instagramUrl", "facebookUrl"]) menu.venue[key] = "";
  const footer = footerOf(menu);
  assert.ok(footer.includes("Chichkhan Café"), "the venue is still named");
  assert.ok(footer.includes("Retour en haut"), "and you can still get back up");
  for (const heading of ["Nous trouver", "Nous suivre", "Votre avis"]) {
    assert.ok(!footer.includes(heading), `${heading} should not appear with nothing under it`);
  }
  assert.ok(!/href="tel:"|href=""/.test(footer), "no empty links are left behind");
});
