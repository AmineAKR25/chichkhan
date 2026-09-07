import test from "node:test";
import assert from "node:assert/strict";
import { searchMenu } from "../src/lib/menu-search.ts";
const items = [
  {
    slug: "cafe-turc",
    name: "Café Turc",
    category: "Boissons Chaudes",
    description: "cardamome, servi à la turque",
    price: 5,
  },
  {
    slug: "coupe-havana",
    name: "Coupe Havana",
    category: "Glaces & Coupes",
    description: "dattes de Djerba, vanille, noix de pécan",
    price: 16,
  },
];
test("finds accented menu names from an unaccented query", () =>
  assert.deepEqual(
    searchMenu(items, "CAFE").map((i) => i.slug),
    ["cafe-turc"],
  ));
test("matches ingredients and category words together", () =>
  assert.deepEqual(
    searchMenu(items, "glaces pecan").map((i) => i.slug),
    ["coupe-havana"],
  ));
test("requires all words and handles no matches", () =>
  assert.deepEqual(searchMenu(items, "cafe dattes"), []));
test("leaves an empty query to the category browsing state", () =>
  assert.deepEqual(searchMenu(items, "   "), []));
test("returns the exact product slug and does not modify the catalogue", () => {
  const before = JSON.stringify(items);
  assert.equal(searchMenu(items, "cardamome")[0].slug, "cafe-turc");
  assert.equal(JSON.stringify(items), before);
});
