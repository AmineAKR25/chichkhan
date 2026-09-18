// Reads db/seed.sql back into the shape lib/db.js returns, so tests run
// against the real catalogue without a database.
import { readFileSync } from "node:fs";
import { shapeMenu } from "../../lib/db.js";

const seed = readFileSync(new URL("../../db/seed.sql", import.meta.url), "utf8");

function tuples(table) {
  const start = seed.indexOf(`insert into ${table} `);
  // Find the statement terminator at an end of line, whichever line endings
  // the checkout has: git core.autocrlf yields CRLF on Windows.
  const offset = seed.slice(start).search(/;\r?\n/);
  const chunk = seed.slice(start, offset === -1 ? undefined : start + offset);
  return [...chunk.matchAll(/^  \((.*)\),?$/gm)].map(([, row]) => {
    const values = [];
    const token = /'((?:[^']|'')*)'|(-?\d+)|(true|false)/g;
    let match;
    while ((match = token.exec(row))) {
      if (match[1] !== undefined) values.push(match[1].replace(/''/g, "'"));
      else if (match[2] !== undefined) values.push(Number(match[2]));
      else values.push(match[3] === "true");
    }
    return values;
  });
}

const venues = tuples("venues").map(([slug, name, title, subtitle, eyebrow, description, hero_image_alt, hero_focus_y]) =>
  ({ slug, name, title, subtitle, eyebrow, description, hero_image_alt, hero_focus_y, hero_image_key: null, logo_image_key: null }));
const groups = tuples("category_groups").map(([venue, name, position], i) => ({ id: i + 1, venue, name, position }));
const categories = tuples("categories").map(([venue, group, slug, name, note, source, position], i) => ({
  id: i + 1, venue, group_id: groups.find((g) => g.venue === venue && g.name === group)?.id ?? null, slug, name, note, source, position, image_key: null,
}));
const items = tuples("menu_items").map(([venue, categorySlug, name, description, price_millimes, is_house, position], i) => ({
  id: i + 1, venue, category_id: categories.find((c) => c.venue === venue && c.slug === categorySlug)?.id, category_slug: categorySlug, name, description, price_millimes, is_house, position,
}));

export const rows = { venues, groups, categories, items };

// Mirrors the four queries in lib/db.js for one venue.
export function catalogue(venue, { imageKeys = false } = {}) {
  const byOrder = (a, b) => a.position - b.position || a.id - b.id;
  const venueRows = venues.filter((v) => v.slug === venue).map((v) => imageKeys ? { ...v, hero_image_key: `venues/${venue}/hero.webp`, logo_image_key: `venues/${venue}/logo.webp` } : v);
  const categoryRows = categories.filter((c) => c.venue === venue).sort(byOrder).map((c) => imageKeys ? { ...c, image_key: `categories/${venue}/${c.slug}.webp` } : c);
  const itemRows = items.filter((i) => i.venue === venue).sort((a, b) => a.category_id - b.category_id || byOrder(a, b));
  return shapeMenu(venueRows, groups.filter((g) => g.venue === venue).sort(byOrder), categoryRows, itemRows);
}
