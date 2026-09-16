import { neon } from "@neondatabase/serverless";

// Raised whenever the menu cannot be read: no DATABASE_URL, an invalid
// connection string, a network failure, a timeout or a query error.
// There is deliberately no fallback catalogue.
export class MenuUnavailableError extends Error {}

// One HTTP round trip to Neon: four read-only queries in a single transaction,
// every one filtered by the venue taken from the URL.
export async function loadMenu(venue, { databaseUrl, timeoutMs = 8000 } = {}) {
  if (!databaseUrl) throw new MenuUnavailableError("DATABASE_URL is not set");
  let results;
  try {
    const sql = neon(databaseUrl);
    results = await sql.transaction([
      sql`select slug, name, title, subtitle, eyebrow, description, hero_image_key, hero_image_alt, hero_focus_y, logo_image_key
          from venues where slug = ${venue}::venue`,
      sql`select id, name from category_groups where venue = ${venue}::venue order by position, id`,
      sql`select id, group_id, slug, name, note, image_key from categories
          where venue = ${venue}::venue and is_visible order by position, id`,
      sql`select id, category_id, name, description, price_millimes, is_house from menu_items
          where venue = ${venue}::venue and is_visible order by position, id`,
    ], { readOnly: true, fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } });
  } catch (error) {
    throw new MenuUnavailableError("The menu database could not be read", { cause: error });
  }
  return shapeMenu(...results);
}

// Turns database rows into the structure the page renders. Returns null when
// the venue row does not exist. Categories without visible items are dropped.
export function shapeMenu(venueRows, groupRows, categoryRows, itemRows) {
  const venue = venueRows[0];
  if (!venue) return null;
  const categories = categoryRows.map((row) => ({
    id: Number(row.id),
    groupId: row.group_id == null ? null : Number(row.group_id),
    slug: row.slug,
    name: row.name,
    note: row.note ?? "",
    imageKey: row.image_key,
    items: [],
  }));
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const row of itemRows) {
    byId.get(Number(row.category_id))?.items.push({
      id: Number(row.id),
      name: row.name,
      description: row.description ?? "",
      millimes: Number(row.price_millimes),
      isHouse: Boolean(row.is_house),
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
      heroFocusY: Number(venue.hero_focus_y ?? 50),
      logoImageKey: venue.logo_image_key,
    },
    groups: groupRows.map((row) => ({ id: Number(row.id), name: row.name })),
    categories: categories.filter((category) => category.items.length > 0),
  };
}
