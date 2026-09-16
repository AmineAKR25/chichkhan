# Chichkhan Djerba

Chichkhan is the main application in this repository. It serves two independent menu sites from one codebase, and every menu fact comes live from a Neon Postgres database:

- `/restaurant`: SO Restaurant Lounge (seeded with 73 items across 11 categories).
- `/cafe`: Chichkhan Café (seeded with 150 items across 20 categories).

There is no homepage and no chooser. Neither route links to, names or hints at the other. `/` redirects to `/restaurant`, and the previous `/menu-1` and `/menu-2` paths redirect permanently, so printed QR codes keep working.

## How a page is built

1. A guest opens `/cafe`. Vercel rewrites it to `api/menu.js?venue=cafe`.
2. `lib/handler.js` accepts only `restaurant` or `cafe`. Anything else is a 404 and never reaches the database.
3. `lib/db.js` sends four read-only queries to Neon in one HTTP transaction (venue, groups, categories, items), each filtered by that venue.
4. `lib/render.js` renders the full HTML page, and embeds the names and prices the browser needs for search and Ma sélection.
5. The response is cached at Vercel's edge for 60 seconds and refreshed in the background, so edits in Neon appear within about a minute.

**No database, no menu.** If `DATABASE_URL` is missing, invalid, unreachable or times out (8 s), the page answers 503 with only "La carte est momentanément indisponible." There is no fallback catalogue, and no venue name, category or product is shown. A venue with no visible items shows "La carte arrive bientôt."

**Images are optional.** Hero photo, logo and category images come from Cloudflare R2. When `R2_PUBLIC_BASE_URL` or an image key is missing, or an image fails to load, the coloured placeholder stays in its place.

Each category has a coloured placeholder below its heading, cut like the entrance arch. Phone and tablet show it as a short band (taller when it holds an image); desktop places it beside the list, never taller than the list (at most 260px). Placeholders step aside during search.

## The hero

One compact navy or green band carries the logo, eyebrow, venue title and entrance photograph (all from the `venues` table and R2), framed as an arch on the right at every breakpoint. `venues.hero_focus_y` sets the vertical crop. There is no separate site header, so the name appears once. The band scrolls away; only the category toolbar stays pinned. No marketing headline or descriptive copy is displayed.

The visual system uses locally hosted Cormorant Garamond and DM Sans with their SIL Open Font License files in `src/assets/fonts/`. Menu titles, tabular prices and restrained solid category placeholders carry the page hierarchy. The smallest label is 11px.

## Browsing

The whole menu scrolls continuously. On phones and tablets a pinned rail of category chips follows the category being read (scroll-spy) and jumps to a category on tap; the grid button opens a native dialog with the same groups, counts and an accent-insensitive category filter. Desktop has a grouped sidebar that follows the same scroll position. On a 390×844 phone the first dish starts at about 320px.

The URL fragment follows the category being read (`replaceState`), and choosing a category pushes a history entry, so deep links and back/forward work. "Début de la carte" returns to the first category. Pages are rendered on the server, so without JavaScript all menu content and native category anchors remain available. A small bootstrap shows the toolbar before the module loads; it expires automatically if the module fails.

Categories where no item has a description (coffees, crêpes, ice creams, chichas and so on) render as a compact two-column price list; their heading reads "N choix · prix en DT". Prices keep all three decimals, with the millimes set lighter. Items named after the house (`/chichkhane?|\bSO\b/i`: 4 on the restaurant, 9 on the café) carry a small "Maison" mark; the list is derived from supplied names and awaits owner confirmation.

Dish descriptions are always visible, including every breakfast composition. There are no disclosure controls, truncation or collapsed ingredients.

## Search

Search covers the entire active menu and accepts unaccented queries and uppercase ligatures such as `BŒUF`. On phones and tablets it opens from the search button in the rail; on desktop the field is always shown. When the field is empty it suggests up to six frequent ingredients computed on each render from that venue's own descriptions (never category names, each returning at least three dishes). Matching words are highlighted in names and descriptions without losing accents. Clearing search returns to the category being read. Escape clears search, then closes it; Command/Ctrl+K opens it, with the hint matching the platform.

## Ma sélection

A + button beside each price adds the item to a private list on that phone. A bar shows the count and running total, and a sheet lists items with quantity steppers, the total and a two-step "Vider la sélection". It is explicitly not an order ("Ce n’est pas une commande : montrez-la au serveur."): nothing is sent anywhere. The list is stored per venue in `localStorage`, keyed by database item id, amounts are integer millimes, and the buttons are created by script, so the no-JavaScript page is unchanged.

## Carte de nuit

The site follows the device's dark mode: a deep green (café) or navy (SO) ground, brass for the current category and primary actions, deeper tints of the same placeholder hues, and matching `theme-color` values. All colours are tokens in `src/style.css`.

No ordering, payment or new venue claims were added. Existing menu contents, prices, notes and source provenance are preserved.

## Set up Neon (database)

1. Create a Neon project, preferably in **AWS Europe Central 1 (Frankfurt)**, the region closest to Djerba and the one `vercel.json` pins the function to (`fra1`).
2. In the Neon SQL Editor, run `db/schema.sql`, then `db/seed.sql`. Both run inside a transaction.
3. Recommended: create a read-only role for the website (replace the password with a long random one):
   ```sql
   create role menu_site with login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
   grant usage on schema public to menu_site;
   grant select on venues, category_groups, categories, menu_items to menu_site;
   ```
4. Copy the **pooled** connection string for that role into `DATABASE_URL`: in Vercel (Project → Settings → Environment Variables) and in `.env.local` for local development.

Schema overview (`db/schema.sql`):

| Table | Holds | Notes |
|---|---|---|
| `venues` | name, title, subtitle, eyebrow, description, hero/logo image keys, hero alt, hero crop | Primary key `slug` of enum type `venue` (`restaurant`, `cafe`) |
| `category_groups` | Sidebar headings (“À boire”…) | Per venue, ordered by `position` |
| `categories` | slug (URL fragment), name, note, image key, source provenance | `unique (venue, slug)`; `is_visible` hides without deleting |
| `menu_items` | name, description, `price_millimes`, `is_house` | Composite FK `(venue, category_id)`: an item cannot land in the other venue’s category |

Prices are integer millimes: `15500` is 15,500 DT. Every table has `updated_at` maintained by a trigger. Everyday edits:

```sql
update menu_items set price_millimes = 16500 where venue = 'cafe' and name = 'Classique';
update menu_items set is_visible = false where venue = 'restaurant' and name = 'Lasagne';
insert into menu_items (venue, category_id, name, description, price_millimes, position)
select 'cafe', id, 'Thé glacé', 'Menthe, citron.', 9500, 9 from categories where venue = 'cafe' and slug = 'softs';
```

## Set up Cloudflare R2 (images)

1. Cloudflare dashboard → R2 → **Create bucket** (e.g. `chichkhan-menu`).
2. Bucket → Settings → **Public access** → connect a **custom domain** (e.g. `images.your-domain.tn`). The `r2.dev` URL works for testing but is rate-limited and not meant for production.
3. Upload images with these keys (WebP, about 800px wide for the hero, 96px for the logo, 900px for categories):
   - `venues/restaurant/hero.webp`, `venues/cafe/hero.webp`
   - `venues/restaurant/logo.webp`, `venues/cafe/logo.webp`
   - `categories/<venue>/<category-slug>.webp`, e.g. `categories/cafe/glaces.webp`

   From the command line: `npx wrangler r2 object put chichkhan-menu/venues/cafe/hero.webp --file src/assets/entrance-729.webp --content-type image/webp --cache-control "public, max-age=31536000" --remote`. The existing entrance and logo derivatives in `src/assets/` are ready to upload.
4. Set `R2_PUBLIC_BASE_URL` to the public domain (e.g. `https://images.your-domain.tn`) in Vercel and `.env.local`.
5. Point the database at the uploaded files. Keys that do not exist simply keep the placeholder, but each costs a failed request, so set only what you uploaded:
   ```sql
   update venues set hero_image_key = 'venues/' || slug || '/hero.webp', logo_image_key = 'venues/' || slug || '/logo.webp';
   update categories set image_key = 'categories/' || venue || '/' || slug || '.webp' where venue = 'cafe' and slug = 'glaces';
   ```

## Build and preview

```sh
npm install
npm test
cp .env.example .env.local   # then fill in DATABASE_URL and R2_PUBLIC_BASE_URL
npm run dev
```

Open http://localhost:4173/restaurant or http://localhost:4173/cafe. `npm run dev` copies the static files into `dist/` and starts a local server that applies the same redirects and rewrites as Vercel, calling the same `api/menu.js`. Without `DATABASE_URL` both routes show the unavailable page. Set `PORT` to use another port. Use Node.js 22.9 or later.

## Layout

```
api/menu.js     Vercel function behind /restaurant and /cafe
lib/
  handler.js    venue allowlist, status codes, cache headers, asset version
  db.js         Neon queries and row shaping (no fallback data)
  render.js     server-rendered page, unavailable and not-found pages, search suggestions
  images.js     R2 object key → public URL, rejecting unsafe keys
db/
  schema.sql    tables, enum, constraints, triggers
  seed.sql      the initial 223-item catalogue with source provenance
src/            static files published by npm run build
  style.css     shared visual system, dark mode, responsive layouts
  menu.js       scroll-spy rail, search, suggestions, history and dialogs
  selection.js  Ma sélection
  search.js     accent-insensitive matching, shared with the server
  assets/       fonts and favicon (published); entrance/logo derivatives for R2
assets-source/  the supplied originals, never published
tests/          node:test suite; tests/helpers/catalogue.mjs reads db/seed.sql
dist/           build output (git-ignored)
```

## Tests

`npm test` needs no database: it reads `db/seed.sql` back into the same shape `lib/db.js` returns. It covers the schema’s venue separation, catalogue totals, search, rendering of every item and price, compact lists, suggestions, safe embedding of database text, R2 URLs and placeholders, the venue allowlist, and the 503 page showing nothing from the menu when the database is missing or failing.

## Deployment

Vercel uses the repository root. `vercel.json` runs `npm run build`, publishes `dist`, rewrites `/restaurant` and `/cafe` to `api/menu.js`, pins the function to `fra1`, and keeps the `/`, `/menu-1` and `/menu-2` redirects. Set `DATABASE_URL` and `R2_PUBLIC_BASE_URL` for Production and Preview. The site remains `noindex`.
