// Validation shared by the admin server and browser: Tunisian dinar prices in
// integer millimes, safe category web addresses and required names.
import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice, parsePrice, priceInputValue, slugify, validateCategory, validateGroup, validateProduct } from "../src/admin/shared.js";

test("prices are read strictly into integer millimes", () => {
  const cases = { "12.500": 12500, "12,5": 12500, "12": 12000, "0": 0, "12.500 DT": 12500, " 7,25 ": 7250, "9999.999": 9999999, "0.005": 5, "3 dt": 3000 };
  for (const [input, millimes] of Object.entries(cases)) assert.deepEqual(parsePrice(input), { millimes }, input);
  for (const input of ["", " ", "-1", "−2", "1 000", "1.000.000", "12.5000", "abc", "1e3", "0x10", "12..5", "12.", ".5", "10000", "12,500,000", null, undefined]) {
    assert.ok(parsePrice(input).error, `${input} should be rejected`);
  }
  assert.match(parsePrice("-4").error, /négatif/);
  assert.match(parsePrice("12.5000").error, /trois décimales/);
});

test("prices display as Tunisian dinars with three decimals", () => {
  assert.equal(formatPrice(12500), "12.500 DT");
  assert.equal(formatPrice(18500), "18.500 DT");
  assert.equal(formatPrice(0), "0.000 DT");
  assert.equal(formatPrice(7), "0.007 DT");
  assert.equal(priceInputValue(35000), "35.000");
  // Round trip: what is shown is what is saved.
  for (const millimes of [0, 5, 990, 12500, 58000, 9999999]) assert.equal(parsePrice(priceInputValue(millimes)).millimes, millimes);
});

test("category web addresses are generated from names and validated", () => {
  assert.equal(slugify("Crêpes & gaufres"), "crepes-gaufres");
  assert.equal(slugify("Émincé de BŒUF"), "emince-de-boeuf");
  assert.equal(slugify("  --Thé  glacé-- "), "the-glace");
  assert.equal(slugify("Côte à l’os"), "cote-a-los");
  assert.equal(validateCategory({ name: "Boissons fraîches" }).data.slug, "boissons-fraiches");
  for (const slug of ["Glaces", "glaces!", "-glaces", "glaces--2", "gla ces", "a".repeat(61)]) {
    assert.ok(validateCategory({ name: "Glaces", slug }).errors.slug, slug);
  }
  assert.deepEqual(validateCategory({ name: "Glaces", slug: "glaces-2" }).errors, {});
  assert.ok(validateCategory({ name: " " }).errors.name);
  assert.ok(validateCategory({ name: "X", groupId: "abc" }).errors.groupId);
});

test("products need a name, a valid price and a category", () => {
  const valid = validateProduct({ name: "  Couscous  ", description: "Agneau,\nlégumes", price: "18,5", categoryId: 3, isVisible: true, isHouse: false });
  assert.deepEqual(valid.errors, {});
  assert.deepEqual(valid.data, { name: "Couscous", description: "Agneau, légumes", millimes: 18500, categoryId: 3, isVisible: true, isHouse: false });
  const invalid = validateProduct({ name: "", price: "-2", categoryId: null, isVisible: "yes" });
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["categoryId", "isVisible", "name", "price"]);
  assert.ok(validateProduct({ name: "x".repeat(121), price: "1", categoryId: 1 }).errors.name);
  assert.ok(validateGroup({ name: "" }).errors.name);
});

test("the page header checks only the fields it is sent", async () => {
  const { validateVenueDetails, PHOTO_POSITIONS } = await import("../src/admin/shared.js");
  assert.deepEqual(validateVenueDetails({ heroFocusY: 50 }), { errors: {}, data: { heroFocusY: 50 } });
  assert.deepEqual(validateVenueDetails({ title: "  SO  ", subtitle: "" }).data, { title: "SO", subtitle: "" });
  assert.ok(validateVenueDetails({ title: "" }).errors.title);
  assert.ok(validateVenueDetails({ name: "x".repeat(121) }).errors.name);
  for (const value of [-1, 101, 12.5, "", null, "middle"]) assert.ok(validateVenueDetails({ heroFocusY: value }).errors.heroFocusY, String(value));
  assert.deepEqual(PHOTO_POSITIONS.map((option) => option.value), [0, 50, 100]);
});
