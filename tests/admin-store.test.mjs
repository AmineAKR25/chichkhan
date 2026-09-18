// The admin data layer against a real Postgres (PGlite) loaded from
// db/schema.sql and db/seed.sql: ordering, venue isolation, transactions,
// deletion, undo and history. No database server or credentials needed.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { menuQueries, shapeMenu } from "../lib/db.js";
import {
  UNDO_MINUTES, isImageKeyReferenced, loadAudit, loadOverview, loadVenueState, resolveImageTarget, runOperation, setImageKey,
} from "../lib/admin/store.js";
import { closeTemplate, freshDatabase } from "./helpers/pglite.mjs";

after(closeTemplate);

async function withDb(fn) {
  const database = await freshDatabase();
  try {
    await fn(database);
  } finally {
    await database.close();
  }
}
const run = (db, op, venue, input = {}) => runOperation(db, op, { venue, actor: "owner", input });
const rejects = (promise, status, pattern) => assert.rejects(promise, (error) => {
  assert.equal(error.status, status, error.message);
  if (pattern) assert.match(error.message, pattern);
  return true;
});
const productsIn = (state, categoryId) => state.products.filter((p) => p.categoryId === categoryId).sort((a, b) => a.position - b.position);
const categoryBySlug = (state, slug) => state.categories.find((c) => c.slug === slug);
const positionsAreSequential = (rows) => rows.every((row, index) => row.position === index + 1);
const snapshotOf = async (pg, venue) => JSON.stringify((await pg.query(
  "select 'c' || id || ':' || position || ':' || coalesce(group_id, 0) || ':' || is_visible as r from categories where venue = $1::venue union all select 'i' || id || ':' || category_id || ':' || position || ':' || price_millimes || ':' || is_visible from menu_items where venue = $1::venue order by 1", [venue])).rows);
// The public site's own queries, run against the same database.
async function publicMenu(pg, venue) {
  const results = [];
  for (const [text, params] of menuQueries(venue)) results.push((await pg.query(text, params)).rows);
  return shapeMenu(...results);
}

test("venue state holds only that venue, in public display order", async () => {
  await withDb(async ({ db }) => {
    const cafe = await loadVenueState(db, "cafe");
    const restaurant = await loadVenueState(db, "restaurant");
    assert.deepEqual([cafe.categories.length, cafe.products.length], [20, 150]);
    assert.deepEqual([restaurant.categories.length, restaurant.products.length], [11, 73]);
    assert.ok(cafe.categories.every((c) => !restaurant.categories.some((r) => r.id === c.id)));
    assert.ok(positionsAreSequential(cafe.categories));
    assert.equal(cafe.venue.label, "Café");
    await rejects(loadVenueState(db, "bar"), 404);
    await rejects(loadVenueState(db, "cafe' or '1'='1"), 404);
  });
});

test("an id from the other venue is not found and changes nothing", async () => {
  await withDb(async ({ db, pg }) => {
    const restaurant = await loadVenueState(db, "restaurant");
    const product = restaurant.products[0];
    const category = restaurant.categories[0];
    const group = restaurant.groups[0];
    const before = [await snapshotOf(pg, "cafe"), await snapshotOf(pg, "restaurant")];
    await rejects(run(db, "product.update", "cafe", { id: product.id, name: "X", price: "1", categoryId: category.id }), 404);
    await rejects(run(db, "product.move", "cafe", { id: product.id, direction: "down" }), 404);
    await rejects(run(db, "product.visibility", "cafe", { id: product.id, isVisible: false }), 404);
    await rejects(run(db, "product.delete", "cafe", { id: product.id }), 404);
    await rejects(run(db, "product.duplicate", "cafe", { id: product.id }), 404);
    await rejects(run(db, "category.move", "cafe", { id: category.id, direction: "down" }), 404);
    await rejects(run(db, "category.delete", "cafe", { id: category.id, mode: "purge", confirm: true, expectedProductCount: 4 }), 404);
    await rejects(run(db, "group.delete", "cafe", { id: group.id }), 404);
    await rejects(run(db, "image.remove", "cafe", { target: "product", id: product.id }), 404);
    // Creating in, or moving to, the other venue's category is refused too.
    const cafe = await loadVenueState(db, "cafe");
    await rejects(run(db, "product.create", "cafe", { name: "X", price: "1", categoryId: category.id }), 400);
    await rejects(run(db, "product.update", "cafe", { id: cafe.products[0].id, name: "X", price: "1", categoryId: category.id }), 400);
    await rejects(run(db, "category.create", "cafe", { name: "X", groupId: group.id }), 400);
    await rejects(run(db, "category.delete", "cafe", { id: cafe.categories[0].id, mode: "reassign", targetCategoryId: category.id, expectedProductCount: productsIn(cafe, cafe.categories[0].id).length }), 400);
    assert.deepEqual([await snapshotOf(pg, "cafe"), await snapshotOf(pg, "restaurant")], before);
    await rejects(run(db, "product.move", "bar", { id: product.id, direction: "up" }), 404);
    await rejects(run(db, "drop.table", "cafe", {}), 404);
  });
});

test("products move up and down within their category, with stable 1..n positions", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "cafe");
    const category = categoryBySlug(state, "jus");
    const [first, second, third] = productsIn(state, category.id);
    const otherVenue = await snapshotOf(pg, "restaurant");

    const moved = await run(db, "product.move", "cafe", { id: second.id, direction: "up" });
    assert.equal(moved.message, `${second.name} a été déplacé au-dessus de ${first.name}.`);
    assert.deepEqual(moved.order.slice(0, 3).map((o) => o.id), [second.id, first.id, third.id]);
    const rows = productsIn(moved.state, category.id);
    assert.deepEqual(rows.slice(0, 3).map((p) => p.id), [second.id, first.id, third.id]);
    assert.ok(positionsAreSequential(rows));

    await rejects(run(db, "product.move", "cafe", { id: second.id, direction: "up" }), 409, /déjà le premier/);
    const last = rows.at(-1);
    await rejects(run(db, "product.move", "cafe", { id: last.id, direction: "down" }), 409, /déjà le dernier/);
    await rejects(run(db, "product.move", "cafe", { id: first.id, direction: "sideways" }), 400);
    assert.equal(await snapshotOf(pg, "restaurant"), otherVenue);

    // The public page reads the same order.
    const publicCategory = (await publicMenu(pg, "cafe")).categories.find((c) => c.slug === "jus");
    assert.deepEqual(publicCategory.items.slice(0, 2).map((i) => i.id), [second.id, first.id]);
  });
});

test("categories move within their group; groups move with their categories", async () => {
  await withDb(async ({ db, pg }) => {
    let state = await loadVenueState(db, "cafe");
    const cafes = categoryBySlug(state, "cafes");
    const glacés = categoryBySlug(state, "cafes-glaces");
    const moved = await run(db, "category.move", "cafe", { id: glacés.id, direction: "up" });
    assert.equal(moved.message, "Cafés glacés a été déplacée au-dessus de Cafés & chocolat.");
    state = moved.state;
    assert.ok(positionsAreSequential(state.categories));
    assert.ok(state.categories.findIndex((c) => c.id === glacés.id) < state.categories.findIndex((c) => c.id === cafes.id));
    // First in "À boire": cannot jump into "Pour commencer".
    await rejects(run(db, "category.move", "cafe", { id: glacés.id, direction: "up" }), 409, /première catégorie de son groupe/);

    const drinks = state.groups.find((g) => g.name === "À boire");
    const groupMove = await run(db, "group.move", "cafe", { id: drinks.id, direction: "up" });
    assert.equal(groupMove.message, "Le groupe “À boire” a été déplacé au-dessus de “Pour commencer”.");
    assert.deepEqual(groupMove.order.map((o) => o.position), [1, 2, 3, 4, 5]);
    state = groupMove.state;
    assert.equal(state.groups[0].id, drinks.id);
    // Category positions follow the new group order, on the admin and the public page.
    assert.equal(state.categories[0].id, glacés.id);
    assert.ok(positionsAreSequential(state.categories));
    const menu = await publicMenu(pg, "cafe");
    assert.equal(menu.categories[0].slug, "cafes-glaces");
    assert.equal(menu.groups[0].name, "À boire");
    await rejects(run(db, "group.move", "cafe", { id: drinks.id, direction: "up" }), 409, /déjà le premier groupe/);
  });
});

test("editing a product validates strictly and records price changes in millimes", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "restaurant");
    const product = state.products.find((p) => p.name === "Lasagne");
    const input = { id: product.id, name: product.name, description: "", price: "18,5", categoryId: product.categoryId, isVisible: true, isHouse: false };
    const saved = await run(db, "product.update", "restaurant", input);
    assert.equal(saved.message, "Le prix de Lasagne a été mis à jour : 18.500 DT.");
    assert.equal(saved.state.products.find((p) => p.id === product.id).millimes, 18500);
    const history = await loadAudit(db, "restaurant");
    assert.equal(history.entries[0].action, "price");
    assert.equal(history.entries[0].actor, "owner");
    assert.equal(history.entries[0].summary, "Le prix de Lasagne a été mis à jour : 18.500 DT.");
    const details = (await pg.query("select details from admin_audit where action = 'price'")).rows[0].details;
    assert.deepEqual(details, { before: 32000, after: 18500 });

    for (const [price, pattern] of [["-3", /négatif/], ["12.5000", /trois décimales/], ["abc", /dinars/], ["", /Saisissez un prix/], ["10000", /inférieur à 10 000/]]) {
      await assert.rejects(run(db, "product.update", "restaurant", { ...input, price }), (error) => {
        assert.equal(error.status, 400);
        assert.match(error.fields.price, pattern);
        return true;
      });
    }
    await assert.rejects(run(db, "product.update", "restaurant", { ...input, name: "   " }), (error) => Boolean(error.fields.name));
    await assert.rejects(run(db, "product.update", "restaurant", { ...input, isVisible: "yes" }), (error) => Boolean(error.fields.isVisible));
    assert.equal((await run(db, "product.update", "restaurant", { ...input, price: "18.500 DT" })).message, "Aucune modification à enregistrer.");
  });
});

test("moving a product to another category puts it at the end and closes the gap", async () => {
  await withDb(async ({ db }) => {
    const state = await loadVenueState(db, "cafe");
    const source = categoryBySlug(state, "jus");
    const target = categoryBySlug(state, "smoothies");
    const product = productsIn(state, source.id)[1];
    const result = await run(db, "product.update", "cafe", {
      id: product.id, name: product.name, description: product.description, price: String(product.millimes / 1000),
      categoryId: target.id, isVisible: product.isVisible, isHouse: product.isHouse,
    });
    assert.match(result.message, new RegExp(`${product.name} a été déplacé à la fin de Smoothies\\.`));
    const targetRows = productsIn(result.state, target.id);
    assert.equal(targetRows.at(-1).id, product.id);
    assert.ok(positionsAreSequential(targetRows));
    assert.ok(positionsAreSequential(productsIn(result.state, source.id)));
    assert.equal((await loadAudit(db, "cafe")).entries[0].action, "move");
  });
});

test("visibility changes hide products and categories from the public page only", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "cafe");
    const glaces = categoryBySlug(state, "glaces");
    const hidden = await run(db, "category.visibility", "cafe", { id: glaces.id, isVisible: false });
    assert.equal(hidden.message, "La catégorie “Glaces” est masquée dans le menu Café.");
    assert.ok(!(await publicMenu(pg, "cafe")).categories.some((c) => c.slug === "glaces"));
    assert.equal((await publicMenu(pg, "restaurant")).categories.length, 11);

    const product = productsIn(state, categoryBySlug(state, "jus").id)[0];
    const result = await run(db, "product.visibility", "cafe", { id: product.id, isVisible: false });
    assert.equal(result.message, `${product.name} est masqué dans le menu Café.`);
    assert.ok(!(await publicMenu(pg, "cafe")).categories.flatMap((c) => c.items).some((i) => i.id === product.id));
    await rejects(run(db, "product.visibility", "cafe", { id: product.id, isVisible: "false" }), 400);

    const shown = await run(db, "product.visibility", "cafe", { id: productsIn(state, glaces.id)[0].id, isVisible: true });
    assert.match(shown.message, /déjà visible/);
  });
});

test("creating categories checks slugs and groups, and new categories join the end of their group", async () => {
  await withDb(async ({ db }) => {
    let state = await loadVenueState(db, "cafe");
    const drinks = state.groups.find((g) => g.name === "À boire");
    const created = await run(db, "category.create", "cafe", { name: "Thés glacés", groupId: drinks.id, isVisible: true });
    state = created.state;
    const category = state.categories.find((c) => c.id === created.id);
    assert.equal(category.slug, "thes-glaces");
    const inGroup = state.categories.filter((c) => c.groupId === drinks.id);
    assert.equal(inGroup.at(-1).id, created.id);
    assert.ok(positionsAreSequential(state.categories));
    await assert.rejects(run(db, "category.create", "cafe", { name: "Glaces 2", slug: "glaces" }), (error) => /utilise déjà/.test(error.fields.slug));
    await assert.rejects(run(db, "category.create", "cafe", { name: "X", slug: "Bad Slug!" }), (error) => /minuscules/.test(error.fields.slug));
    // The same slug is fine in the other venue.
    const other = await run(db, "category.create", "restaurant", { name: "Glaces" });
    assert.equal(other.state.categories.find((c) => c.id === other.id).slug, "glaces");
    // An ungrouped category goes last, after every group.
    const loose = await run(db, "category.create", "cafe", { name: "Saison" });
    assert.equal(loose.state.categories.at(-1).id, loose.id);
  });
});

test("duplicating a product makes a hidden copy right after the original", async () => {
  await withDb(async ({ db }) => {
    const state = await loadVenueState(db, "restaurant");
    const product = state.products.find((p) => p.name === "Salade César");
    const result = await run(db, "product.duplicate", "restaurant", { id: product.id });
    const rows = productsIn(result.state, product.categoryId);
    const index = rows.findIndex((p) => p.id === product.id);
    assert.equal(rows[index + 1].id, result.id);
    assert.equal(rows[index + 1].name, "Salade César (copie)");
    assert.equal(rows[index + 1].isVisible, false);
    assert.equal(rows[index + 1].millimes, product.millimes);
    assert.ok(positionsAreSequential(rows));
  });
});

test("a deleted product can be undone, returning with the same id and place", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "cafe");
    const category = categoryBySlug(state, "jus");
    const product = productsIn(state, category.id)[2];
    const deleted = await run(db, "product.delete", "cafe", { id: product.id });
    assert.equal(deleted.message, `${product.name} a été supprimé du menu Café.`);
    assert.ok(deleted.undo.id > 0);
    assert.ok(!deleted.state.products.some((p) => p.id === product.id));
    assert.ok(positionsAreSequential(productsIn(deleted.state, category.id)));
    // Undo is scoped to the venue as well.
    await rejects(run(db, "undo", "restaurant", { deletionId: deleted.undo.id }), 410);
    const restored = await run(db, "undo", "cafe", { deletionId: deleted.undo.id });
    assert.equal(restored.message, `“${product.name}” a été restauré.`);
    assert.equal(productsIn(restored.state, category.id)[2].id, product.id);
    await rejects(run(db, "undo", "cafe", { deletionId: deleted.undo.id }), 409, /a déjà été restauré/);

    const again = await run(db, "product.delete", "cafe", { id: product.id });
    await pg.query("update admin_deletions set created_at = now() - make_interval(mins => $1) where id = $2", [UNDO_MINUTES + 1, again.undo.id]);
    await rejects(run(db, "undo", "cafe", { deletionId: again.undo.id }), 410, /trop tard pour annuler/);
  });
});

test("deleting a category can move its products elsewhere, in one transaction, and be undone", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "cafe");
    const source = categoryBySlug(state, "mojitos");
    const target = categoryBySlug(state, "cocktails");
    const moving = productsIn(state, source.id);
    const targetBefore = productsIn(state, target.id);
    await rejects(run(db, "category.delete", "cafe", { id: source.id, mode: "reassign", targetCategoryId: target.id, expectedProductCount: moving.length + 1 }), 409, /Vérifiez à nouveau votre choix/);
    await rejects(run(db, "category.delete", "cafe", { id: source.id, expectedProductCount: moving.length }), 400);
    const result = await run(db, "category.delete", "cafe", { id: source.id, mode: "reassign", targetCategoryId: target.id, expectedProductCount: moving.length });
    assert.equal(result.message, `La catégorie “Mojitos” a été supprimée. Ses ${moving.length} produits ont été déplacés vers “Cocktails”.`);
    const after = productsIn(result.state, target.id);
    assert.deepEqual(after.map((p) => p.id), [...targetBefore, ...moving].map((p) => p.id));
    assert.ok(positionsAreSequential(after));
    assert.ok(positionsAreSequential(result.state.categories));

    const undone = await run(db, "undo", "cafe", { deletionId: result.undo.id });
    assert.deepEqual(productsIn(undone.state, source.id).map((p) => p.id), moving.map((p) => p.id));
    assert.deepEqual(productsIn(undone.state, target.id).map((p) => p.id), targetBefore.map((p) => p.id));
    assert.deepEqual(undone.state.categories.map((c) => c.id), state.categories.map((c) => c.id));
    const audit = (await pg.query("select action from admin_audit where venue = 'cafe' order by id")).rows.map((r) => r.action);
    assert.deepEqual(audit, ["delete", "restore"]);
  });
});

test("permanently deleting a category needs explicit confirmation; undo restores everything", async () => {
  await withDb(async ({ db, pg }) => {
    const state = await loadVenueState(db, "restaurant");
    const sauces = categoryBySlug(state, "sauces");
    const items = productsIn(state, sauces.id);
    await rejects(run(db, "category.delete", "restaurant", { id: sauces.id, mode: "purge", expectedProductCount: items.length }), 400, /Confirm/);
    const result = await run(db, "category.delete", "restaurant", { id: sauces.id, mode: "purge", confirm: true, expectedProductCount: items.length });
    assert.match(result.message, /La catégorie “Sauces” et ses \d+ produits ont été supprimés\./);
    assert.equal((await pg.query("select count(*)::int n from menu_items where category_id = $1", [sauces.id])).rows[0].n, 0);
    const undone = await run(db, "undo", "restaurant", { deletionId: result.undo.id });
    assert.deepEqual(productsIn(undone.state, sauces.id).map((p) => [p.id, p.name, p.millimes]), items.map((p) => [p.id, p.name, p.millimes]));
    assert.equal(undone.state.categories.at(-1).id, sauces.id);
  });
});

test("a group is only deleted once empty; its categories are never deleted with it", async () => {
  await withDb(async ({ db }) => {
    const state = await loadVenueState(db, "cafe");
    const sweets = state.groups.find((g) => g.name === "Les douceurs");
    const members = state.categories.filter((c) => c.groupId === sweets.id);
    await rejects(run(db, "group.delete", "cafe", { id: sweets.id }), 409, /Déplacez-les vers Sans groupe/);
    const ungrouped = await run(db, "group.ungroup", "cafe", { id: sweets.id });
    assert.equal(ungrouped.message, `Déplacement de ${members.length} catégories de “Les douceurs” vers Sans groupe. Elles restent dans le menu sans titre de groupe.`);
    assert.equal(ungrouped.state.categories.length, 20);
    assert.deepEqual(ungrouped.state.categories.slice(-members.length).map((c) => c.id), members.map((c) => c.id));
    const deleted = await run(db, "group.delete", "cafe", { id: sweets.id });
    assert.equal(deleted.state.groups.length, 4);
    assert.deepEqual(deleted.state.groups.map((g) => g.position), [1, 2, 3, 4]);
    const undone = await run(db, "undo", "cafe", { deletionId: deleted.undo.id });
    assert.equal(undone.state.groups[2].id, sweets.id);
  });
});

test("group names are validated and unique within a venue", async () => {
  await withDb(async ({ db }) => {
    await assert.rejects(run(db, "group.create", "cafe", { name: "à BOIRE" }), (error) => /existe déjà/.test(error.fields.name));
    const created = await run(db, "group.create", "restaurant", { name: "Pour commencer" });
    assert.equal(created.state.groups.at(-1).name, "Pour commencer");
    const renamed = await run(db, "group.rename", "restaurant", { id: created.id, name: "Apéritifs" });
    assert.equal(renamed.message, "Le groupe “Pour commencer” a été renommé en “Apéritifs”.");
    await assert.rejects(run(db, "group.rename", "restaurant", { id: created.id, name: "" }), (error) => Boolean(error.fields.name));
  });
});

test("photo keys: a replaced or removed key is released only when nothing refers to it", async () => {
  await withDb(async ({ db }) => {
    const state = await loadVenueState(db, "cafe");
    const product = state.products[0];
    const first = await setImageKey(db, { venue: "cafe", actor: "owner", target: "product", id: product.id, key: "products/cafe/1-aaaaaaaaaa.webp" });
    assert.deepEqual(first.releasedKeys, []);
    const copy = await run(db, "product.duplicate", "cafe", { id: product.id });
    const replaced = await setImageKey(db, { venue: "cafe", actor: "owner", target: "product", id: product.id, key: "products/cafe/1-bbbbbbbbbb.webp" });
    assert.deepEqual(replaced.releasedKeys, ["products/cafe/1-aaaaaaaaaa.webp"]);
    // The copy still shows the old photo, so it must stay in storage.
    assert.equal(await isImageKeyReferenced(db, "products/cafe/1-aaaaaaaaaa.webp"), true);
    const removed = await run(db, "image.remove", "cafe", { target: "product", id: copy.id });
    assert.match(removed.message, /fond coloré/);
    assert.equal(await isImageKeyReferenced(db, "products/cafe/1-aaaaaaaaaa.webp"), false);
    // A deleted product keeps its photo while the deletion can be undone.
    const deleted = await run(db, "product.delete", "cafe", { id: product.id });
    assert.equal(await isImageKeyReferenced(db, "products/cafe/1-bbbbbbbbbb.webp"), true);
    assert.ok(deleted.undo);
    // Venue photos resolve to their own columns and stay in their venue.
    const hero = await resolveImageTarget(db, "restaurant", { target: "venue", slot: "hero" });
    assert.equal(hero.column, "hero_image_key");
    await rejects(resolveImageTarget(db, "restaurant", { target: "venue", slot: "banner" }), 400);
    await rejects(resolveImageTarget(db, "restaurant", { target: "product", id: state.products[1].id }), 404);
  });
});

test("history and the overview stay per venue", async () => {
  await withDb(async ({ db }) => {
    const cafe = await loadVenueState(db, "cafe");
    await run(db, "product.visibility", "cafe", { id: cafe.products[0].id, isVisible: false });
    await run(db, "category.create", "restaurant", { name: "Vins" });
    const cafeHistory = await loadAudit(db, "cafe");
    assert.equal(cafeHistory.entries.length, 1);
    assert.ok(cafeHistory.entries.every((entry) => entry.venue === "cafe"));
    const overview = await loadOverview(db);
    const [cafeSummary, restaurantSummary] = overview.venues;
    assert.equal(cafeSummary.hiddenProducts, 1);
    assert.equal(cafeSummary.visibleProducts, 149);
    assert.equal(restaurantSummary.categories, 12);
    assert.equal(overview.activity.length, 2);
    await rejects(loadAudit(db, "cafe", { before: "1; drop table venues" }), 400);
  });
});

test("the page header changes field by field, is checked, logged, and stays in its venue", async () => {
  await withDb(async ({ db, pg }) => {
    const restaurantBefore = (await publicMenu(pg, "restaurant")).venue;
    const saved = await run(db, "venue.update", "cafe", { title: "Chichkhan", subtitle: "Café & Salon", eyebrow: "Djerba", name: "Chichkhan Café", heroImageAlt: "La façade" });
    assert.equal(saved.message, "L’en-tête de la page Café a été mis à jour (deuxième ligne, petite ligne au-dessus du nom, description de la photo principale).");
    assert.equal(saved.state.venue.subtitle, "Café & Salon");
    const page = (await publicMenu(pg, "cafe")).venue;
    assert.deepEqual([page.subtitle, page.eyebrow, page.heroImageAlt], ["Café & Salon", "Djerba", "La façade"]);
    assert.deepEqual((await publicMenu(pg, "restaurant")).venue, restaurantBefore, "the other venue is untouched");

    // The photo window sends only the position; the texts stay as they are.
    const moved = await run(db, "venue.update", "cafe", { heroFocusY: 100 });
    assert.equal(moved.message, "La photo principale de la page Café affiche maintenant sa partie basse.");
    assert.equal(moved.state.venue.heroFocusY, 100);
    assert.equal(moved.state.venue.subtitle, "Café & Salon");
    assert.equal((await run(db, "venue.update", "cafe", { heroFocusY: 100 })).message, "Aucune modification à enregistrer.");

    for (const [input, field] of [[{ title: "  " }, "title"], [{ name: "" }, "name"], [{ heroFocusY: 101 }, "heroFocusY"], [{ heroFocusY: "top" }, "heroFocusY"], [{ subtitle: "x".repeat(61) }, "subtitle"]]) {
      await assert.rejects(run(db, "venue.update", "cafe", input), (error) => Boolean(error.fields?.[field]), field);
    }
    await rejects(run(db, "venue.update", "cafe", {}), 400, /Aucune modification à enregistrer/);
    await rejects(run(db, "venue.update", "bar", { title: "X" }), 404);
    const history = await loadAudit(db, "cafe");
    assert.deepEqual(history.entries.map((entry) => entry.action), ["update", "update"]);
    assert.ok(history.entries.every((entry) => entry.recordType === "venue" && entry.actor === "owner"));
  });
});
