import {
  ADMIN_VENUES, LIMITS, VENUE_LABELS, formatPrice, hasErrors,
  validateCategory, validateGroup, validateProduct, validateVenueDetails,
} from "../../src/admin/shared.js";
import { AdminError, fieldError } from "./errors.js";

// Every admin read and write for the menus. Rules that hold throughout:
// - every statement filters by the venue, validated against the enum first;
//   an id from the other venue is simply "not found";
// - every change runs in one transaction that first takes a per-venue lock,
//   so concurrent edits and moves never interleave;
// - `position` is rewritten as 1..n after every reorder, so order is stable
//   and never has duplicates. It only affects the public website's display.
// `db` is anything with query(text, params) and transaction(fn): node-postgres
// in the app (lib/database.js), PGlite in the tests.

export const UNDO_MINUTES = 15;

export function assertVenue(venue) {
  if (!ADMIN_VENUES.includes(venue)) throw new AdminError(404, "Ce menu n’existe pas.");
  return venue;
}

function assertId(value, what) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new AdminError(400, `Choisissez un(e) ${what} valide.`);
  return id;
}
function assertDirection(value) {
  if (value !== "up" && value !== "down") throw new AdminError(400, "Choisissez Monter ou Descendre.");
  return value;
}
function assertBoolean(value, message = "Choisissez visible ou masqué.") {
  if (typeof value !== "boolean") throw new AdminError(400, message);
  return value;
}

const quote = (name) => `“${name}”`;
const menuName = (venue) => `menu ${VENUE_LABELS[venue]}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const truncate = (text, max) => (text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text);

// ---------------------------------------------------------------------------
// Reads

const categoryOrderSql = `
  select c.id, c.group_id, c.name from categories c
  left join category_groups g on g.venue = c.venue and g.id = c.group_id
  where c.venue = $1::venue
  order by (g.id is null), g.position, g.id, c.position, c.id`;

export async function loadVenueState(q, venue) {
  assertVenue(venue);
  const venueRow = (await q.query(
    "select slug, name, title, subtitle, eyebrow, hero_image_key, hero_image_alt, logo_image_key from venues where slug = $1::venue", [venue])).rows[0];
  if (!venueRow) throw new AdminError(404, `${VENUE_LABELS[venue]} n’est pas encore dans la base de données. Chargez d’abord db/seed.sql.`);
  const groups = (await q.query("select id, name, position from category_groups where venue = $1::venue order by position, id", [venue])).rows;
  const categories = (await q.query(`
    select c.id, c.group_id, c.slug, c.name, c.note, c.image_key, c.is_visible, c.position from categories c
    left join category_groups g on g.venue = c.venue and g.id = c.group_id
    where c.venue = $1::venue
    order by (g.id is null), g.position, g.id, c.position, c.id`, [venue])).rows;
  const products = (await q.query(`
    select id, category_id, name, description, price_millimes, is_house, is_visible, image_key, position
    from menu_items where venue = $1::venue order by category_id, position, id`, [venue])).rows;
  return {
    venue: {
      slug: venueRow.slug,
      label: VENUE_LABELS[venue],
      name: venueRow.name,
      title: venueRow.title,
      subtitle: venueRow.subtitle ?? "",
      eyebrow: venueRow.eyebrow ?? "",
      heroImageKey: venueRow.hero_image_key,
      heroImageAlt: venueRow.hero_image_alt ?? "",
      logoImageKey: venueRow.logo_image_key,
    },
    groups: groups.map((row) => ({ id: Number(row.id), name: row.name, position: Number(row.position) })),
    categories: categories.map((row) => ({
      id: Number(row.id),
      groupId: row.group_id == null ? null : Number(row.group_id),
      slug: row.slug,
      name: row.name,
      note: row.note ?? "",
      imageKey: row.image_key,
      isVisible: Boolean(row.is_visible),
      position: Number(row.position),
    })),
    products: products.map((row) => ({
      id: Number(row.id),
      categoryId: Number(row.category_id),
      name: row.name,
      description: row.description ?? "",
      millimes: Number(row.price_millimes),
      isHouse: Boolean(row.is_house),
      isVisible: Boolean(row.is_visible),
      imageKey: row.image_key,
      position: Number(row.position),
    })),
  };
}

// The overview card for one venue: its header and three counts.
export async function loadVenueSummary(q, venue) {
  assertVenue(venue);
  const row = (await q.query(`
    select v.slug, v.name, v.title, v.subtitle, v.hero_image_key,
      (select count(*) from categories c where c.venue = v.slug)::int as categories,
      (select count(*) from menu_items i where i.venue = v.slug and i.is_visible)::int as visible_products,
      (select count(*) from menu_items i where i.venue = v.slug and not i.is_visible)::int as hidden_products
    from venues v where v.slug = $1::venue`, [venue])).rows[0];
  if (!row) return { slug: venue, label: VENUE_LABELS[venue], missing: true };
  return {
    slug: venue,
    label: VENUE_LABELS[venue],
    name: row.name,
    title: row.title,
    subtitle: row.subtitle ?? "",
    heroImageKey: row.hero_image_key,
    categories: row.categories,
    visibleProducts: row.visible_products,
    hiddenProducts: row.hidden_products,
  };
}

const auditRow = (row) => ({
  id: String(row.id),
  createdAt: new Date(row.created_at).toISOString(),
  actor: row.actor,
  venue: row.venue,
  action: row.action,
  recordType: row.record_type,
  recordId: row.record_id == null ? null : Number(row.record_id),
  recordName: row.record_name,
  summary: row.summary,
});

export async function loadAudit(q, venue, { limit = 40, before = null } = {}) {
  assertVenue(venue);
  const size = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const cursor = before == null || before === "" ? null : String(before);
  if (cursor !== null && !/^\d{1,18}$/.test(cursor)) throw new AdminError(400, "Position d’historique invalide.");
  const { rows } = await q.query(`
    select id, created_at, actor, venue, action, record_type, record_id, record_name, summary from admin_audit
    where venue = $1::venue and ($2::bigint is null or id < $2::bigint)
    order by id desc limit $3`, [venue, cursor, size + 1]);
  return { entries: rows.slice(0, size).map(auditRow), more: rows.length > size };
}

export async function loadOverview(q) {
  const venues = [];
  const activity = [];
  for (const venue of ADMIN_VENUES) {
    venues.push(await loadVenueSummary(q, venue));
    activity.push(...(await loadAudit(q, venue, { limit: 8 })).entries);
  }
  activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id));
  return { venues, activity: activity.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Transactions, ordering and history

async function inVenue(db, venue, actor, work) {
  assertVenue(venue);
  return db.transaction(async (tx) => {
    // Serialises every admin change to this venue.
    await tx.query("select pg_advisory_xact_lock(hashtext('chichkhan-admin'), hashtext($1))", [venue]);
    const context = {
      tx,
      venue,
      actor: String(actor ?? ""),
      audit: (entry) => tx.query(`
        insert into admin_audit (actor, venue, action, record_type, record_id, record_name, summary, details)
        values ($1, $2::venue, $3, $4, $5, $6, $7, $8::jsonb)`,
        [String(actor ?? ""), venue, entry.action, entry.recordType, entry.recordId ?? null, entry.recordName ?? "", entry.summary, JSON.stringify(entry.details ?? {})]),
    };
    const result = (await work(context)) ?? {};
    // Photos kept only for undo are released once the undo window has passed.
    const expired = await tx.query(
      "delete from admin_deletions where venue = $1::venue and created_at < now() - make_interval(mins => $2) returning image_keys",
      [venue, UNDO_MINUTES]);
    result.releasedKeys = [...new Set([...(result.releasedKeys ?? []), ...expired.rows.flatMap((row) => row.image_keys ?? [])])].filter(Boolean);
    result.state = await loadVenueState(tx, venue);
    return result;
  });
}

const ORDERED_TABLES = new Set(["category_groups", "categories", "menu_items"]);
// Writes positions 1..n in the given id order, touching only rows that change.
async function writeOrder(tx, table, venue, ids) {
  if (!ORDERED_TABLES.has(table)) throw new Error(`not an ordered table: ${table}`);
  if (!ids.length) return;
  await tx.query(`
    update ${table} t set position = o.ord::int
    from unnest($2::int[]) with ordinality as o(id, ord)
    where t.venue = $1::venue and t.id = o.id and t.position <> o.ord`, [venue, ids]);
}

async function orderedGroups(tx, venue) {
  return (await tx.query("select id, name from category_groups where venue = $1::venue order by position, id", [venue])).rows
    .map((row) => ({ id: Number(row.id), name: row.name }));
}
async function orderedCategories(tx, venue) {
  return (await tx.query(categoryOrderSql, [venue])).rows
    .map((row) => ({ id: Number(row.id), groupId: row.group_id == null ? null : Number(row.group_id), name: row.name }));
}
async function orderedProducts(tx, venue, categoryId) {
  return (await tx.query(
    "select id, name from menu_items where venue = $1::venue and category_id = $2 order by position, id", [venue, categoryId])).rows
    .map((row) => ({ id: Number(row.id), name: row.name }));
}

// Category positions follow the grouped order the public navigation shows:
// groups in order, their categories in order, then categories with no group.
async function renumberCategories(tx, venue) {
  const rows = await orderedCategories(tx, venue);
  await writeOrder(tx, "categories", venue, rows.map((row) => row.id));
  return rows;
}
async function renumberGroups(tx, venue) {
  const rows = await orderedGroups(tx, venue);
  await writeOrder(tx, "category_groups", venue, rows.map((row) => row.id));
  return rows;
}
async function renumberProducts(tx, venue, categoryId) {
  const rows = await orderedProducts(tx, venue, categoryId);
  await writeOrder(tx, "menu_items", venue, rows.map((row) => row.id));
  return rows;
}
const orderOf = (rows) => rows.map((row, index) => ({ id: row.id, position: index + 1 }));

// Puts a restored record back at its old position (1-based) in a list.
function placeAt(ids, id, position) {
  const rest = ids.filter((other) => other !== id);
  const index = Math.min(Math.max(Number(position) - 1 || 0, 0), rest.length);
  rest.splice(index, 0, id);
  return rest;
}

async function getGroup(tx, venue, id) {
  const row = (await tx.query("select id, name, position from category_groups where venue = $1::venue and id = $2",
    [venue, assertId(id, "group")])).rows[0];
  if (!row) throw new AdminError(404, "Ce groupe n’existe plus. Rechargez la page pour voir le menu à jour.");
  return { ...row, id: Number(row.id) };
}
async function getCategory(tx, venue, id) {
  const row = (await tx.query(`
    select id, group_id, slug, name, note, image_key, original_key, is_visible, position from categories
    where venue = $1::venue and id = $2`, [venue, assertId(id, "category")])).rows[0];
  if (!row) throw new AdminError(404, "Cette catégorie n’existe plus. Rechargez la page pour voir le menu à jour.");
  return { ...row, id: Number(row.id), group_id: row.group_id == null ? null : Number(row.group_id) };
}
async function getProduct(tx, venue, id) {
  const row = (await tx.query(`
    select id, category_id, name, description, price_millimes, is_house, is_visible, image_key, original_key, position from menu_items
    where venue = $1::venue and id = $2`, [venue, assertId(id, "product")])).rows[0];
  if (!row) throw new AdminError(404, "Ce produit n’existe plus. Rechargez la page pour voir le menu à jour.");
  return { ...row, id: Number(row.id), category_id: Number(row.category_id), price_millimes: Number(row.price_millimes) };
}
async function countProducts(tx, venue, categoryId, onlyVisible = false) {
  return Number((await tx.query(
    `select count(*)::int as n from menu_items where venue = $1::venue and category_id = $2${onlyVisible ? " and is_visible" : ""}`,
    [venue, categoryId])).rows[0].n);
}

async function recordDeletion(context, { recordType, recordId, recordName, snapshot, imageKeys = [] }) {
  const row = (await context.tx.query(`
    insert into admin_deletions (actor, venue, record_type, record_id, record_name, snapshot, image_keys)
    values ($1, $2::venue, $3, $4, $5, $6::jsonb, $7::text[])
    returning id, created_at + make_interval(mins => $8) as expires_at`,
    [context.actor, context.venue, recordType, recordId, recordName, JSON.stringify(snapshot), imageKeys.filter(Boolean), UNDO_MINUTES])).rows[0];
  return { id: Number(row.id), expiresAt: new Date(row.expires_at).toISOString() };
}

// ---------------------------------------------------------------------------
// Groups

async function assertGroupNameFree(tx, venue, name, exceptId = 0) {
  const taken = (await tx.query(
    "select 1 from category_groups where venue = $1::venue and lower(name) = lower($2) and id <> $3", [venue, name, exceptId])).rows.length;
  if (taken) throw fieldError({ name: `Un groupe nommé ${quote(name)} existe déjà dans ce menu.` });
}

async function createGroup(context, input) {
  const { tx, venue } = context;
  const { data, errors } = validateGroup(input);
  if (hasErrors(errors)) throw fieldError(errors);
  await assertGroupNameFree(tx, venue, data.name);
  const row = (await tx.query(`
    insert into category_groups (venue, name, position)
    select $1::venue, $2, coalesce(max(position), 0) + 1 from category_groups where venue = $1::venue
    returning id`, [venue, data.name])).rows[0];
  await context.audit({ action: "create", recordType: "group", recordId: row.id, recordName: data.name, summary: `Groupe ${quote(data.name)} créé.` });
  return { id: Number(row.id), message: `Le groupe ${quote(data.name)} a été ajouté à la fin du ${menuName(venue)}.` };
}

async function renameGroup(context, input) {
  const { tx, venue } = context;
  const group = await getGroup(tx, venue, input.id);
  const { data, errors } = validateGroup(input);
  if (hasErrors(errors)) throw fieldError(errors);
  if (data.name === group.name) return { message: "Aucune modification à enregistrer." };
  await assertGroupNameFree(tx, venue, data.name, group.id);
  await tx.query("update category_groups set name = $3 where venue = $1::venue and id = $2", [venue, group.id, data.name]);
  const summary = `Le groupe ${quote(group.name)} a été renommé en ${quote(data.name)}.`;
  await context.audit({ action: "update", recordType: "group", recordId: group.id, recordName: data.name, summary, details: { before: group.name, after: data.name } });
  return { message: summary };
}

async function moveGroup(context, input) {
  const { tx, venue } = context;
  const direction = assertDirection(input.direction);
  const group = await getGroup(tx, venue, input.id);
  const groups = await orderedGroups(tx, venue);
  const index = groups.findIndex((row) => row.id === group.id);
  const other = index + (direction === "up" ? -1 : 1);
  if (other < 0 || other >= groups.length) {
    throw new AdminError(409, `${quote(group.name)} est déjà le ${direction === "up" ? "premier" : "dernier"} groupe.`);
  }
  const neighbour = groups[other];
  [groups[index], groups[other]] = [groups[other], groups[index]];
  await writeOrder(tx, "category_groups", venue, groups.map((row) => row.id));
  await renumberCategories(tx, venue);
  const summary = `Le groupe ${quote(group.name)} a été déplacé ${direction === "up" ? "au-dessus" : "au-dessous"} de ${quote(neighbour.name)}.`;
  await context.audit({ action: "reorder", recordType: "group", recordId: group.id, recordName: group.name, summary, details: { direction, position: other + 1 } });
  return { message: summary, order: orderOf(groups) };
}

async function ungroupCategories(context, input) {
  const { tx, venue } = context;
  const group = await getGroup(tx, venue, input.id);
  const moved = (await tx.query(
    "update categories set group_id = null where venue = $1::venue and group_id = $2 returning id, name", [venue, group.id])).rows;
  if (!moved.length) return { message: `${quote(group.name)} ne contient aucune catégorie à déplacer.` };
  await renumberCategories(tx, venue);
  const summary = `Déplacement de ${plural(moved.length, "catégorie", "catégories")} de ${quote(group.name)} vers Sans groupe.`;
  await context.audit({ action: "move", recordType: "group", recordId: group.id, recordName: group.name, summary, details: { categories: moved.map((row) => Number(row.id)) } });
  return { message: `${summary} Elles restent dans le menu sans titre de groupe.` };
}

async function deleteGroup(context, input) {
  const { tx, venue } = context;
  const group = await getGroup(tx, venue, input.id);
  const inside = Number((await tx.query(
    "select count(*)::int as n from categories where venue = $1::venue and group_id = $2", [venue, group.id])).rows[0].n);
  // Never let the foreign key silently ungroup categories.
  if (inside) {
    throw new AdminError(409, `${quote(group.name)} contient encore ${plural(inside, "catégorie", "catégories")}. Déplacez-les vers Sans groupe avant de supprimer le groupe.`, { code: "group-not-empty" });
  }
  const snapshot = (await tx.query("select to_jsonb(g) as doc from category_groups g where venue = $1::venue and id = $2", [venue, group.id])).rows[0].doc;
  const undo = await recordDeletion(context, { recordType: "group", recordId: group.id, recordName: group.name, snapshot: { group: snapshot } });
  await tx.query("delete from category_groups where venue = $1::venue and id = $2", [venue, group.id]);
  await renumberGroups(tx, venue);
  const summary = `Le groupe ${quote(group.name)} a été supprimé.`;
  await context.audit({ action: "delete", recordType: "group", recordId: group.id, recordName: group.name, summary });
  return { message: summary, undo };
}

// ---------------------------------------------------------------------------
// Categories

async function assertGroupInVenue(tx, venue, groupId) {
  if (groupId == null) return null;
  const row = (await tx.query("select id, name from category_groups where venue = $1::venue and id = $2", [venue, groupId])).rows[0];
  if (!row) throw fieldError({ groupId: "Ce groupe n’existe plus. Choisissez-en un autre." });
  return row;
}
async function assertSlugFree(tx, venue, slug, exceptId = 0) {
  const row = (await tx.query("select name from categories where venue = $1::venue and slug = $2 and id <> $3", [venue, slug, exceptId])).rows[0];
  if (row) throw fieldError({ slug: `${quote(row.name)} utilise déjà l’adresse web « ${slug} ». Choisissez-en une autre.` });
}

async function createCategory(context, input) {
  const { tx, venue } = context;
  const { data, errors } = validateCategory(input);
  if (hasErrors(errors)) throw fieldError(errors);
  const group = await assertGroupInVenue(tx, venue, data.groupId);
  await assertSlugFree(tx, venue, data.slug);
  const row = (await tx.query(`
    insert into categories (venue, group_id, slug, name, note, is_visible, position)
    values ($1::venue, $2, $3, $4, $5, $6, (select coalesce(max(position), 0) + 1 from categories where venue = $1::venue))
    returning id`, [venue, data.groupId, data.slug, data.name, data.note, data.isVisible])).rows[0];
  await renumberCategories(tx, venue);
  const where = group ? ` dans ${quote(group.name)}` : "";
  await context.audit({ action: "create", recordType: "category", recordId: row.id, recordName: data.name, summary: `Catégorie ${quote(data.name)} créée${where}.`, details: data });
  return {
    id: Number(row.id),
    message: `La catégorie ${quote(data.name)} a été ajoutée${where}.${data.isVisible ? "" : " Elle est masquée du menu public."}`,
    warning: "Ajoutez des produits pour qu’elle apparaisse dans le menu public.",
  };
}

async function updateCategory(context, input) {
  const { tx, venue } = context;
  const current = await getCategory(tx, venue, input.id);
  const { data, errors } = validateCategory(input);
  if (hasErrors(errors)) throw fieldError(errors);
  const group = await assertGroupInVenue(tx, venue, data.groupId);
  await assertSlugFree(tx, venue, data.slug, current.id);
  const groupChanged = (current.group_id ?? null) !== (data.groupId ?? null);
  const visibilityChanged = current.is_visible !== data.isVisible;
  const edited = ["name", "slug", "note"].filter((field) => current[field] !== data[field]);
  if (!groupChanged && !visibilityChanged && !edited.length) return { message: "Aucune modification à enregistrer." };
  await tx.query(`
    update categories set name = $3, slug = $4, note = $5, group_id = $6, is_visible = $7,
      position = case when $8 then (select coalesce(max(position), 0) + 1 from categories where venue = $1::venue) else position end
    where venue = $1::venue and id = $2`,
    [venue, current.id, data.name, data.slug, data.note, data.groupId, data.isVisible, groupChanged]);
  if (groupChanged) await renumberCategories(tx, venue);
  const sentences = [];
  const base = { recordType: "category", recordId: current.id, recordName: data.name };
  if (edited.length) {
    const labels = { name: "nom", slug: "adresse web", note: "note du menu" };
    const summary = `Catégorie ${quote(data.name)} mise à jour (${edited.map((field) => labels[field]).join(", ")}).`;
    await context.audit({ ...base, action: "update", summary, details: Object.fromEntries(edited.map((field) => [field, { before: current[field], after: data[field] }])) });
    sentences.push(`Les modifications de ${quote(data.name)} ont été enregistrées.`);
  }
  if (groupChanged) {
    const summary = `La catégorie ${quote(data.name)} a été déplacée à la fin de ${group ? quote(group.name) : "Sans groupe"}.`;
    await context.audit({ ...base, action: "move", summary, details: { from: current.group_id, to: data.groupId } });
    sentences.push(summary);
  }
  if (visibilityChanged) {
    const summary = data.isVisible ? `La catégorie ${quote(data.name)} est maintenant visible dans le ${menuName(venue)}.` : `La catégorie ${quote(data.name)} est masquée dans le ${menuName(venue)}.`;
    await context.audit({ ...base, action: "visibility", summary, details: { isVisible: data.isVisible } });
    sentences.push(summary);
  }
  const warning = data.isVisible && !(await countProducts(tx, venue, current.id, true))
    ? "Elle ne contient aucun produit visible ; les clients ne la voient donc pas encore." : undefined;
  return { message: sentences.join(" "), warning };
}

async function setCategoryVisibility(context, input) {
  const { tx, venue } = context;
  const category = await getCategory(tx, venue, input.id);
  const isVisible = assertBoolean(input.isVisible);
  if (category.is_visible === isVisible) return { message: `La catégorie ${quote(category.name)} est déjà ${isVisible ? "visible" : "masquée"}.` };
  await tx.query("update categories set is_visible = $3 where venue = $1::venue and id = $2", [venue, category.id, isVisible]);
  const summary = isVisible ? `La catégorie ${quote(category.name)} est maintenant visible dans le ${menuName(venue)}.` : `La catégorie ${quote(category.name)} est masquée dans le ${menuName(venue)}.`;
  await context.audit({ action: "visibility", recordType: "category", recordId: category.id, recordName: category.name, summary, details: { isVisible } });
  const warning = isVisible && !(await countProducts(tx, venue, category.id, true))
    ? "Elle ne contient aucun produit visible ; les clients ne la voient donc pas encore." : undefined;
  return { message: summary, warning };
}

// Categories move within their group; to change group, edit the category.
async function moveCategory(context, input) {
  const { tx, venue } = context;
  const direction = assertDirection(input.direction);
  const category = await getCategory(tx, venue, input.id);
  const rows = await orderedCategories(tx, venue);
  const index = rows.findIndex((row) => row.id === category.id);
  const other = index + (direction === "up" ? -1 : 1);
  const neighbour = rows[other];
  if (!neighbour || neighbour.groupId !== rows[index].groupId) {
    throw new AdminError(409, `${quote(category.name)} est déjà la ${direction === "up" ? "première" : "dernière"} catégorie de son groupe.`);
  }
  [rows[index], rows[other]] = [rows[other], rows[index]];
  await writeOrder(tx, "categories", venue, rows.map((row) => row.id));
  const summary = `${category.name} a été déplacée ${direction === "up" ? "au-dessus" : "au-dessous"} de ${neighbour.name}.`;
  await context.audit({ action: "reorder", recordType: "category", recordId: category.id, recordName: category.name, summary, details: { direction, position: other + 1 } });
  return { message: summary, order: orderOf(rows) };
}

// mode "empty": the category has no products.
// mode "reassign": its products move to targetCategoryId (same venue) first.
// mode "purge": the category and its products are deleted; needs confirm: true.
// expectedProductCount guards against a count that changed since the dialog opened.
async function deleteCategory(context, input) {
  const { tx, venue } = context;
  const category = await getCategory(tx, venue, input.id);
  const products = (await tx.query(
    "select to_jsonb(i) as doc from menu_items i where venue = $1::venue and category_id = $2 order by position, id",
    [venue, category.id])).rows.map((row) => row.doc);
  const count = products.length;
  if (Number(input.expectedProductCount) !== count) {
    throw new AdminError(409, `${quote(category.name)} contient maintenant ${plural(count, "produit", "produits")}. Vérifiez à nouveau votre choix.`, { code: "count-changed" });
  }
  const categoryRow = (await tx.query("select to_jsonb(c) as doc from categories c where venue = $1::venue and id = $2", [venue, category.id])).rows[0].doc;
  let snapshot;
  let summary;
  let imageKeys = [category.image_key, category.original_key];
  const mode = count === 0 ? "empty" : input.mode;
  if (mode === "empty") {
    snapshot = { category: categoryRow };
    summary = `La catégorie ${quote(category.name)} a été supprimée.`;
  } else if (mode === "reassign") {
    const targetId = assertId(input.targetCategoryId, "catégorie de destination");
    if (targetId === category.id) throw fieldError({ targetCategoryId: "Choisissez une autre catégorie." });
    const target = await getCategory(tx, venue, targetId).catch(() => {
      throw fieldError({ targetCategoryId: "Cette catégorie n’existe plus. Choisissez-en une autre." });
    });
    const offset = Number((await tx.query(
      "select coalesce(max(position), 0)::int as n from menu_items where venue = $1::venue and category_id = $2", [venue, target.id])).rows[0].n);
    // Products keep their order and land at the end of the target category.
    await tx.query(`
      update menu_items set category_id = $3, position = $4 + position
      where venue = $1::venue and category_id = $2`, [venue, category.id, target.id, offset]);
    await renumberProducts(tx, venue, target.id);
    snapshot = { category: categoryRow, reassigned: { targetId: target.id, products: products.map((row) => ({ id: row.id, position: row.position })) } };
    summary = count === 1
      ? `La catégorie ${quote(category.name)} a été supprimée. Son produit a été déplacé vers ${quote(target.name)}.`
      : `La catégorie ${quote(category.name)} a été supprimée. Ses ${count} produits ont été déplacés vers ${quote(target.name)}.`;
  } else if (mode === "purge") {
    if (input.confirm !== true) throw new AdminError(400, "Confirmez la suppression définitive de la catégorie et de ses produits.");
    snapshot = { category: categoryRow, products };
    imageKeys = [...imageKeys, ...products.flatMap((row) => [row.image_key, row.original_key])];
    summary = `La catégorie ${quote(category.name)} et ses ${plural(count, "produit", "produits")} ont été supprimés.`;
  } else {
    throw new AdminError(400, `${quote(category.name)} contient ${plural(count, "produit", "produits")}. Choisissez de les déplacer ou de les supprimer.`);
  }
  const undo = await recordDeletion(context, { recordType: "category", recordId: category.id, recordName: category.name, snapshot, imageKeys });
  await tx.query("delete from categories where venue = $1::venue and id = $2", [venue, category.id]);
  await renumberCategories(tx, venue);
  await context.audit({ action: "delete", recordType: "category", recordId: category.id, recordName: category.name, summary, details: { mode, productCount: count, targetCategoryId: snapshot.reassigned?.targetId ?? null } });
  return { message: summary, undo };
}

// ---------------------------------------------------------------------------
// Products

async function assertCategoryForProduct(tx, venue, categoryId) {
  const row = (await tx.query("select id, name, is_visible from categories where venue = $1::venue and id = $2", [venue, categoryId])).rows[0];
  if (!row) throw fieldError({ categoryId: "Cette catégorie n’existe plus. Choisissez-en une autre." });
  return { ...row, id: Number(row.id) };
}

async function createProduct(context, input) {
  const { tx, venue } = context;
  const { data, errors } = validateProduct(input);
  if (hasErrors(errors)) throw fieldError(errors);
  const category = await assertCategoryForProduct(tx, venue, data.categoryId);
  const row = (await tx.query(`
    insert into menu_items (venue, category_id, name, description, price_millimes, is_house, is_visible, position)
    values ($1::venue, $2, $3, $4, $5, $6, $7,
      (select coalesce(max(position), 0) + 1 from menu_items where venue = $1::venue and category_id = $2))
    returning id`, [venue, category.id, data.name, data.description, data.millimes, data.isHouse, data.isVisible])).rows[0];
  await context.audit({ action: "create", recordType: "product", recordId: row.id, recordName: data.name, summary: `${data.name} added to ${category.name} at ${formatPrice(data.millimes)}.`, details: data });
  return {
    id: Number(row.id),
    message: `${quote(data.name)} a été ajouté à ${quote(category.name)}.${data.isVisible ? "" : " Il est masqué du menu public."}`,
    warning: category.is_visible ? undefined : `${quote(category.name)} est masquée ; les clients ne voient donc pas encore ce produit.`,
  };
}

async function updateProduct(context, input) {
  const { tx, venue } = context;
  const current = await getProduct(tx, venue, input.id);
  const { data, errors } = validateProduct(input);
  if (hasErrors(errors)) throw fieldError(errors);
  const category = await assertCategoryForProduct(tx, venue, data.categoryId);
  const moved = category.id !== current.category_id;
  const priceChanged = current.price_millimes !== data.millimes;
  const visibilityChanged = current.is_visible !== data.isVisible;
  const edited = [["name", "name"], ["description", "description"], ["is_house", "isHouse"]].filter(([column, field]) => current[column] !== data[field]);
  if (!moved && !priceChanged && !visibilityChanged && !edited.length) return { message: "Aucune modification à enregistrer." };
  await tx.query(`
    update menu_items set name = $3, description = $4, price_millimes = $5, is_house = $6, is_visible = $7, category_id = $8,
      position = case when $9 then (select coalesce(max(position), 0) + 1 from menu_items where venue = $1::venue and category_id = $8) else position end
    where venue = $1::venue and id = $2`,
    [venue, current.id, data.name, data.description, data.millimes, data.isHouse, data.isVisible, category.id, moved]);
  if (moved) await renumberProducts(tx, venue, current.category_id);
  const base = { recordType: "product", recordId: current.id, recordName: data.name };
  const sentences = [];
  if (edited.length) {
    const labels = { name: "nom", description: "description", is_house: "badge Maison" };
    const summary = `${data.name} a été mis à jour (${edited.map(([column]) => labels[column]).join(", ")}).`;
    await context.audit({ ...base, action: "update", summary, details: Object.fromEntries(edited.map(([column, field]) => [field, { before: current[column], after: data[field] }])) });
    sentences.push(`Changes to ${quote(data.name)} saved.`);
  }
  if (priceChanged) {
    const summary = `Le prix de ${data.name} a été mis à jour : ${formatPrice(data.millimes)}.`;
    await context.audit({ ...base, action: "price", summary, details: { before: current.price_millimes, after: data.millimes } });
    sentences.push(summary);
  }
  if (moved) {
    const summary = `${data.name} a été déplacé à la fin de ${category.name}.`;
    await context.audit({ ...base, action: "move", summary, details: { from: current.category_id, to: category.id } });
    sentences.push(summary);
  }
  if (visibilityChanged) {
    const summary = data.isVisible ? `${data.name} est maintenant visible dans le ${menuName(venue)}.` : `${data.name} est masqué dans le ${menuName(venue)}.`;
    await context.audit({ ...base, action: "visibility", summary, details: { isVisible: data.isVisible } });
    sentences.push(summary);
  }
  return {
    message: sentences.join(" "),
    warning: data.isVisible && !category.is_visible ? `${quote(category.name)} est masquée ; les clients ne voient donc pas encore ce produit.` : undefined,
  };
}

async function setProductVisibility(context, input) {
  const { tx, venue } = context;
  const product = await getProduct(tx, venue, input.id);
  const isVisible = assertBoolean(input.isVisible);
  if (product.is_visible === isVisible) return { message: `${quote(product.name)} est déjà ${isVisible ? "visible" : "masqué"}.` };
  await tx.query("update menu_items set is_visible = $3 where venue = $1::venue and id = $2", [venue, product.id, isVisible]);
  const summary = isVisible ? `${product.name} est maintenant visible dans le ${menuName(venue)}.` : `${product.name} est masqué dans le ${menuName(venue)}.`;
  await context.audit({ action: "visibility", recordType: "product", recordId: product.id, recordName: product.name, summary, details: { isVisible } });
  const category = await getCategory(tx, venue, product.category_id);
  return {
    message: summary,
    warning: isVisible && !category.is_visible ? `Sa catégorie ${quote(category.name)} est masquée ; les clients ne le voient donc pas encore.` : undefined,
  };
}

async function moveProduct(context, input) {
  const { tx, venue } = context;
  const direction = assertDirection(input.direction);
  const product = await getProduct(tx, venue, input.id);
  const rows = await orderedProducts(tx, venue, product.category_id);
  const index = rows.findIndex((row) => row.id === product.id);
  const other = index + (direction === "up" ? -1 : 1);
  if (other < 0 || other >= rows.length) {
    throw new AdminError(409, `${quote(product.name)} est déjà le ${direction === "up" ? "premier" : "dernier"} produit de sa catégorie.`);
  }
  const neighbour = rows[other];
  [rows[index], rows[other]] = [rows[other], rows[index]];
  await writeOrder(tx, "menu_items", venue, rows.map((row) => row.id));
  const summary = `${product.name} a été déplacé ${direction === "up" ? "au-dessus" : "au-dessous"} de ${neighbour.name}.`;
  await context.audit({ action: "reorder", recordType: "product", recordId: product.id, recordName: product.name, summary, details: { direction, position: other + 1 } });
  return { message: summary, order: orderOf(rows) };
}

// The copy is hidden and placed right after the original, so nothing new
// appears on the public menu until the administrator shows it.
async function duplicateProduct(context, input) {
  const { tx, venue } = context;
  const source = await getProduct(tx, venue, input.id);
  const name = truncate(`${source.name} (copie)`, LIMITS.name);
  const row = (await tx.query(`
    insert into menu_items (venue, category_id, name, description, price_millimes, is_house, is_visible, image_key, position)
    values ($1::venue, $2, $3, $4, $5, $6, false, $7, $8) returning id`,
    [venue, source.category_id, name, source.description, source.price_millimes, source.is_house, source.image_key, source.position])).rows[0];
  const id = Number(row.id);
  const ids = (await orderedProducts(tx, venue, source.category_id)).map((r) => r.id).filter((other) => other !== id);
  ids.splice(ids.indexOf(source.id) + 1, 0, id);
  await writeOrder(tx, "menu_items", venue, ids);
  const summary = `${name} a été créé comme copie masquée de ${source.name}.`;
  await context.audit({ action: "create", recordType: "product", recordId: id, recordName: name, summary, details: { duplicatedFrom: source.id } });
  return { id, message: `${quote(name)} a été créé comme copie masquée de ${quote(source.name)}. Rendez-le visible lorsqu’il est prêt.` };
}

async function deleteProduct(context, input) {
  const { tx, venue } = context;
  const product = await getProduct(tx, venue, input.id);
  const row = (await tx.query("select to_jsonb(i) as doc from menu_items i where venue = $1::venue and id = $2", [venue, product.id])).rows[0].doc;
  const undo = await recordDeletion(context, { recordType: "product", recordId: product.id, recordName: product.name, snapshot: { product: row }, imageKeys: [product.image_key, product.original_key] });
  await tx.query("delete from menu_items where venue = $1::venue and id = $2", [venue, product.id]);
  await renumberProducts(tx, venue, product.category_id);
  const summary = `${product.name} a été supprimé du ${menuName(venue)}.`;
  await context.audit({ action: "delete", recordType: "product", recordId: product.id, recordName: product.name, summary, details: { categoryId: product.category_id, price: product.price_millimes } });
  return { message: summary, undo };
}

// ---------------------------------------------------------------------------
// Venue details and photos

// The page header: only the fields sent are changed. Column names come from
// this fixed list, never from the request.
const VENUE_FIELDS = {
  title: { column: "title", label: "nom affiché sur la page" },
  subtitle: { column: "subtitle", label: "deuxième ligne" },
  eyebrow: { column: "eyebrow", label: "petite ligne au-dessus du nom" },
  name: { column: "name", label: "nom complet" },
  heroImageAlt: { column: "hero_image_alt", label: "description de la photo principale" },
};

async function updateVenue(context, input) {
  const { tx, venue } = context;
  const { data, errors } = validateVenueDetails(input);
  if (hasErrors(errors)) throw fieldError(errors);
  const fields = Object.keys(data);
  if (!fields.length) throw new AdminError(400, "Aucune modification à enregistrer.");
  const current = (await tx.query(`select name, ${fields.map((field) => VENUE_FIELDS[field].column).join(", ")} from venues where slug = $1::venue`, [venue])).rows[0];
  if (!current) throw new AdminError(404, "Ce menu n’est pas encore dans la base de données.");
  const changed = fields.filter((field) => current[VENUE_FIELDS[field].column] !== data[field]);
  if (!changed.length) return { message: "Aucune modification à enregistrer." };
  await tx.query(
    `update venues set ${changed.map((field, index) => `${VENUE_FIELDS[field].column} = $${index + 2}`).join(", ")} where slug = $1::venue`,
    [venue, ...changed.map((field) => data[field])]);
  const page = `la page ${VENUE_LABELS[venue]}`;
  const summary = `L’en-tête de ${page} a été mis à jour (${changed.map((field) => VENUE_FIELDS[field].label).join(", ")}).`;
  await context.audit({
    action: "update", recordType: "venue", recordName: data.name ?? current.name, summary,
    details: Object.fromEntries(changed.map((field) => [field, { before: current[VENUE_FIELDS[field].column], after: data[field] }])),
  });
  return { message: summary };
}

// Resolves which column holds a photo. `target` is venue (slot hero|logo),
// category or product; the record must belong to this venue.
export async function resolveImageTarget(q, venue, { target, id, slot }) {
  assertVenue(venue);
  if (target === "venue") {
    if (slot !== "hero" && slot !== "logo") throw new AdminError(400, "Choisissez la photo principale ou le logo.");
    const column = slot === "hero" ? "hero_image_key" : "logo_image_key";
    const originalColumn = slot === "hero" ? "hero_original_key" : "logo_original_key";
    const row = (await q.query(`select name, ${column} as image_key, ${originalColumn} as original_key from venues where slug = $1::venue`, [venue])).rows[0];
    if (!row) throw new AdminError(404, "Ce menu n’est pas encore dans la base de données.");
    return { target, slot, id: null, column, originalColumn, currentKey: row.image_key, currentOriginalKey: row.original_key, label: slot === "hero" ? `la photo principale du ${VENUE_LABELS[venue]}` : `le logo du ${VENUE_LABELS[venue]}`, recordName: row.name, recordType: "venue" };
  }
  if (target === "category") {
    const row = await getCategory(q, venue, id);
    return { target, id: row.id, slug: row.slug, column: "image_key", originalColumn: "original_key", currentKey: row.image_key, currentOriginalKey: row.original_key, label: quote(row.name), recordName: row.name, recordType: "category" };
  }
  if (target === "product") {
    const row = await getProduct(q, venue, id);
    return { target, id: row.id, column: "image_key", originalColumn: "original_key", currentKey: row.image_key, currentOriginalKey: row.original_key, label: quote(row.name), recordName: row.name, recordType: "product" };
  }
  throw new AdminError(400, "Choisissez l’élément auquel appartient la photo.");
}

// `key` is the cropped photo the menu shows. `originalKey` is the whole photo
// it was cut from: a new one when a file was just chosen, or undefined when
// only the framing changed, in which case the stored original stays put so a
// crop is never cut from a crop.
async function writeImageKey(context, spec, key, { originalKey } = {}) {
  const { tx, venue } = context;
  const resolved = await resolveImageTarget(tx, venue, spec);
  // Removing the photo removes its original too; keeping the framing keeps it.
  const nextOriginal = key === null ? null : originalKey === undefined ? resolved.currentOriginalKey : originalKey;
  if (resolved.target === "venue") {
    await tx.query(`update venues set ${resolved.column} = $2, ${resolved.originalColumn} = $3 where slug = $1::venue`, [venue, key, nextOriginal]);
  } else {
    const table = resolved.target === "category" ? "categories" : "menu_items";
    await tx.query(`update ${table} set image_key = $3, original_key = $4 where venue = $1::venue and id = $2`, [venue, resolved.id, key, nextOriginal]);
  }
  const summary = key ? `La photo de ${resolved.label} a été mise à jour.` : `La photo de ${resolved.label} a été supprimée.`;
  await context.audit({ action: "image", recordType: resolved.recordType, recordId: resolved.id, recordName: resolved.recordName, summary, details: { before: resolved.currentKey, after: key } });
  // Both the old crop and the old original go, unless they are still the ones
  // in use. releaseKeys checks every other record before deleting anything.
  const released = [resolved.currentKey, resolved.currentOriginalKey]
    .filter((old) => old && old !== key && old !== nextOriginal);
  return {
    message: key ? summary : `${summary} Le fond coloré est affiché à la place.`,
    releasedKeys: [...new Set(released)],
  };
}

// ---------------------------------------------------------------------------
// Undo

async function restoreDeletion(context, input) {
  const { tx, venue } = context;
  const id = assertId(input.deletionId, "suppression");
  const row = (await tx.query(`
    select id, record_type, record_id, record_name, snapshot, restored_at,
      created_at < now() - make_interval(mins => $3) as expired
    from admin_deletions where venue = $1::venue and id = $2`, [venue, id, UNDO_MINUTES])).rows[0];
  if (!row) throw new AdminError(410, "Il est trop tard pour annuler cette suppression. Vous pouvez créer l’élément de nouveau.");
  if (row.restored_at) throw new AdminError(409, `${quote(row.record_name)} a déjà été restauré.`);
  if (row.expired) throw new AdminError(410, "Il est trop tard pour annuler cette suppression. Vous pouvez créer l’élément de nouveau.");
  const snapshot = row.snapshot;
  if (row.record_type === "product") await restoreProduct(tx, venue, snapshot.product);
  else if (row.record_type === "category") await restoreCategory(tx, venue, snapshot);
  else if (row.record_type === "group") await restoreGroup(tx, venue, snapshot.group);
  await tx.query("update admin_deletions set restored_at = now() where venue = $1::venue and id = $2", [venue, id]);
  const summary = `${row.record_name} a été restauré.`;
  await context.audit({ action: "restore", recordType: row.record_type, recordId: row.record_id, recordName: row.record_name, summary });
  return { message: `${quote(row.record_name)} a été restauré.` };
}

async function assertIdFree(tx, table, id, name) {
  if ((await tx.query(`select 1 from ${table} where id = $1`, [id])).rows.length) {
    throw new AdminError(409, `${quote(name)} existe déjà.`);
  }
}

async function restoreProduct(tx, venue, product) {
  if (product.venue !== venue) throw new AdminError(404, "Aucune suppression à annuler.");
  const category = (await tx.query("select id from categories where venue = $1::venue and id = $2", [venue, product.category_id])).rows[0];
  if (!category) throw new AdminError(409, `La catégorie de ${quote(product.name)} n’existe plus ; il ne peut donc pas être restauré.`);
  await assertIdFree(tx, "menu_items", product.id, product.name);
  await tx.query("insert into menu_items overriding system value select * from jsonb_populate_record(null::menu_items, $1::jsonb)", [JSON.stringify(product)]);
  const ids = (await orderedProducts(tx, venue, product.category_id)).map((row) => row.id);
  await writeOrder(tx, "menu_items", venue, placeAt(ids, product.id, product.position));
}

async function restoreCategory(tx, venue, snapshot) {
  const category = { ...snapshot.category };
  if (category.venue !== venue) throw new AdminError(404, "Aucune suppression à annuler.");
  const taken = (await tx.query("select name from categories where venue = $1::venue and slug = $2", [venue, category.slug])).rows[0];
  if (taken) throw new AdminError(409, `${quote(taken.name)} utilise maintenant l’adresse web « ${category.slug} ». Modifiez-la puis réessayez l’annulation.`);
  await assertIdFree(tx, "categories", category.id, category.name);
  if (category.group_id != null) {
    const group = (await tx.query("select 1 from category_groups where venue = $1::venue and id = $2", [venue, category.group_id])).rows[0];
    if (!group) category.group_id = null;
  }
  await tx.query("insert into categories overriding system value select * from jsonb_populate_record(null::categories, $1::jsonb)", [JSON.stringify(category)]);
  if (snapshot.products?.length) {
    for (const product of snapshot.products) await assertIdFree(tx, "menu_items", product.id, product.name);
    await tx.query("insert into menu_items overriding system value select * from jsonb_populate_recordset(null::menu_items, $1::jsonb)", [JSON.stringify(snapshot.products)]);
  }
  if (snapshot.reassigned) {
    // Products that are still where they were moved return, in their old order.
    for (const product of snapshot.reassigned.products) {
      await tx.query(`
        update menu_items set category_id = $3, position = $5
        where venue = $1::venue and id = $2 and category_id = $4`,
        [venue, product.id, category.id, snapshot.reassigned.targetId, product.position]);
    }
    await renumberProducts(tx, venue, category.id);
    await renumberProducts(tx, venue, snapshot.reassigned.targetId);
  }
  const ids = (await orderedCategories(tx, venue)).map((row) => row.id);
  await writeOrder(tx, "categories", venue, placeAt(ids, category.id, category.position));
  await renumberCategories(tx, venue);
}

async function restoreGroup(tx, venue, group) {
  if (group.venue !== venue) throw new AdminError(404, "Aucune suppression à annuler.");
  const taken = (await tx.query("select 1 from category_groups where venue = $1::venue and lower(name) = lower($2)", [venue, group.name])).rows.length;
  if (taken) throw new AdminError(409, `Un groupe nommé ${quote(group.name)} existe déjà. Renommez-le puis réessayez l’annulation.`);
  await assertIdFree(tx, "category_groups", group.id, group.name);
  await tx.query("insert into category_groups overriding system value select * from jsonb_populate_record(null::category_groups, $1::jsonb)", [JSON.stringify(group)]);
  const ids = (await orderedGroups(tx, venue)).map((row) => row.id);
  await writeOrder(tx, "category_groups", venue, placeAt(ids, group.id, group.position));
  await renumberCategories(tx, venue);
}

// ---------------------------------------------------------------------------
// Public entry points

const operations = {
  "group.create": createGroup,
  "group.rename": renameGroup,
  "group.move": moveGroup,
  "group.ungroup": ungroupCategories,
  "group.delete": deleteGroup,
  "category.create": createCategory,
  "category.update": updateCategory,
  "category.visibility": setCategoryVisibility,
  "category.move": moveCategory,
  "category.delete": deleteCategory,
  "product.create": createProduct,
  "product.update": updateProduct,
  "product.visibility": setProductVisibility,
  "product.move": moveProduct,
  "product.duplicate": duplicateProduct,
  "product.delete": deleteProduct,
  "venue.update": updateVenue,
  "image.remove": (context, input) => writeImageKey(context, input, null),
  undo: restoreDeletion,
};
export const OPERATIONS = Object.keys(operations);

// Runs one named change for one venue. Returns { message, warning?, undo?,
// id?, order?, state, releasedKeys }.
export async function runOperation(db, name, { venue, actor, input = {} }) {
  const operation = Object.hasOwn(operations, name) ? operations[name] : null;
  if (!operation) throw new AdminError(404, "Action inconnue.");
  return inVenue(db, venue, actor, (context) => operation(context, input));
}

// Records a freshly uploaded object key against its record.
export async function setImageKey(db, { venue, actor, target, id, slot, key, originalKey }) {
  return inVenue(db, venue, actor, (context) => writeImageKey(context, { target, id, slot }, key, { originalKey }));
}

// True while any record in either venue, or a deletion that can still be
// undone, refers to the key. A read-only existence check: it exposes nothing,
// and it is what keeps a shared object (a duplicated product's photo, say)
// from being deleted while it is still in use.
export async function isImageKeyReferenced(q, key) {
  const row = (await q.query(`
    select exists (select 1 from venues where $1 in (hero_image_key, logo_image_key, hero_original_key, logo_original_key))
        or exists (select 1 from categories where $1 in (image_key, original_key))
        or exists (select 1 from menu_items where $1 in (image_key, original_key))
        or exists (select 1 from admin_deletions where restored_at is null and $1 = any(image_keys)) as referenced`, [key])).rows[0];
  return Boolean(row.referenced);
}
