import { neon } from "@neondatabase/serverless";
import { getPool, isNeonUrl, withTimeout } from "./database.js";

// Raised whenever the menu cannot be read: no DATABASE_URL, an invalid
// connection string, a network failure, a timeout or a query error.
// There is deliberately no fallback catalogue.
export class MenuUnavailableError extends Error {}

// Four read-only queries in a single transaction, every one filtered by the
// venue taken from the URL.
export const menuQueries = (venue) => [
  [`select slug, name, title, subtitle, eyebrow, description, hero_image_key, hero_image_alt, logo_image_key
    from venues where slug = $1::venue`, [venue]],
  ["select id, name from category_groups where venue = $1::venue order by position, id", [venue]],
  [`select id, group_id, slug, name, note, image_key from categories
    where venue = $1::venue and is_visible order by position, id`, [venue]],
  [`select id, category_id, name, description, price_millimes, is_house, image_key from menu_items
    where venue = $1::venue and is_visible order by position, id`, [venue]],
];

export async function loadMenu(venue, { databaseUrl, timeoutMs = 8000 } = {}) {
  if (!databaseUrl) throw new MenuUnavailableError("DATABASE_URL is not set");
  let results;
  try {
    const queries = menuQueries(venue);
    results = isNeonUrl(databaseUrl)
      ? await readOverHttp(databaseUrl, queries, timeoutMs)
      : await readOverPostgres(databaseUrl, queries, timeoutMs);
  } catch (error) {
    throw new MenuUnavailableError("The menu database could not be read", { cause: error });
  }
  return shapeMenu(...results);
}

// Neon: one HTTP round trip for the whole read-only transaction.
function readOverHttp(databaseUrl, queries, timeoutMs) {
  const sql = neon(databaseUrl);
  return sql.transaction(queries.map(([text, params]) => sql.query(text, params)), {
    readOnly: true,
    fetchOptions: { signal: AbortSignal.timeout(timeoutMs) },
  });
}

// Any other Postgres (the local development database): a read-only transaction.
function readOverPostgres(databaseUrl, queries, timeoutMs) {
  const read = async () => {
    const client = await getPool(databaseUrl).connect();
    try {
      await client.query("begin read only");
      const results = [];
      for (const [text, params] of queries) results.push((await client.query(text, params)).rows);
      await client.query("commit");
      return results;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return withTimeout(read(), timeoutMs);
}

// Turns database rows into the structure the page renders. Returns null when
// the venue row does not exist. Categories without visible items are dropped.
// Categories follow their group's order (ungrouped ones last), so the page
// body always matches the grouped navigation.
export function shapeMenu(venueRows, groupRows, categoryRows, itemRows) {
  const venue = venueRows[0];
  if (!venue) return null;
  const groupRank = new Map(groupRows.map((row, index) => [Number(row.id), index]));
  const rank = (category) => groupRank.get(category.groupId) ?? groupRank.size;
  const categories = categoryRows.map((row) => ({
    id: Number(row.id),
    groupId: row.group_id == null ? null : Number(row.group_id),
    slug: row.slug,
    name: row.name,
    note: row.note ?? "",
    imageKey: row.image_key,
    items: [],
  })).sort((a, b) => rank(a) - rank(b));
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const row of itemRows) {
    byId.get(Number(row.category_id))?.items.push({
      id: Number(row.id),
      name: row.name,
      description: row.description ?? "",
      millimes: Number(row.price_millimes),
      isHouse: Boolean(row.is_house),
      imageKey: row.image_key ?? null,
    });
  }
  return {
    venue: {
      slug: venue.slug,
      name: venue.name,
      title: venue.title,
      subtitle: venue.subtitle ?? "",
      eyebrow: venue.eyebrow ?? "",
      description: venue.description ?? "",
      heroImageKey: venue.hero_image_key,
      heroImageAlt: venue.hero_image_alt ?? "",
      logoImageKey: venue.logo_image_key,
    },
    groups: groupRows.map((row) => ({ id: Number(row.id), name: row.name })),
    categories: categories.filter((category) => category.items.length > 0),
  };
}
