# Chichkhan Djerba

Chichkhan is the main application in this repository. It serves two independent menu sites from one codebase, and every menu fact comes live from a Neon Postgres database:

- `/restaurant`: SO Restaurant Lounge (seeded with 73 items across 11 categories).
- `/cafe`: Chichkhan Café (seeded with 150 items across 20 categories).

There is no homepage and no chooser. Neither route links to, names or hints at the other. `/` redirects to `/restaurant`, and the previous `/menu-1` and `/menu-2` paths redirect permanently, so printed QR codes keep working.

A private admin edits both menus (see [Admin](#admin)). It is reached only through the owner's private link; the public pages never link to it, and `/admin` answers 404 to everyone else.

## How a page is built

1. A guest opens `/cafe`. Vercel rewrites it to `api/menu.js?venue=cafe`.
2. `lib/handler.js` accepts only `restaurant` or `cafe`. Anything else is a 404 and never reaches the database.
3. `lib/db.js` sends four read-only queries to Neon in one HTTP transaction (venue, groups, categories, items), each filtered by that venue. Any other Postgres (the local development database) is read over the standard protocol with the same queries.
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

## Admin

`/admin` is a private workspace for both menus. It is server-rendered by `api/admin.js` behind the rewrites in `vercel.json`, and every page and API call checks the session on the server.

**There is no public sign-in page.** Without a valid session, `/admin`, `/admin/cafe`, `/admin/restaurant` and every `/api/admin` call answer an empty 404 — the same answer a path that was never routed would give — so guessing the address reveals nothing. The one unauthenticated way in is the owner link.

- **Overview** (`/admin`): one card per venue (categories, visible and hidden products, "Manage menu"), a short "Needs attention" list (empty categories, hidden items, missing photos) and recent activity.
- **Menu editors** (`/admin/cafe`, `/admin/restaurant`): a category sidebar (a picker on phones), search and filters (name, visibility, photo, category), the selected category with its products, and "Groups and order" for groups, the category order and the venue's hero photo and logo. Products and categories are edited in a side panel with a public-menu preview; nothing is saved until "Save changes". Every change says what happened in a notification, and deletions offer Undo.
- **Ordering** uses "Move up" and "Move down" only (no drag and drop). It rewrites `position` as 1…n inside one transaction and changes nothing but the order of the public website. Categories move within their group; groups carry their categories with them; products move within their category, and a product moved to another category goes to its end.
- **Deleting** always asks first. A group can only be deleted once empty (its categories can be moved to "No group" first, never deleted with it). A category with products is either emptied into another category or, after a second confirmation, deleted with its products. Deleted records can be restored with Undo for 15 minutes (`admin_deletions`); after that they are gone.
- **History**: every change is written to `admin_audit` with time, action, venue, record and the administrator's name. Customer selections ("Ma sélection") stay in the guest's browser and never reach the database; there is no ordering and no POS link.

**Venue separation.** Every admin query and change is filtered by the `venue` enum, and an id from the other venue is simply "not found". The composite foreign keys in `db/schema.sql` enforce the same rule in the database. Only one check crosses venues: before deleting a photo from storage, the admin makes sure no record in either venue (or a deletion that can still be undone) uses it.

### The owner link

Access starts with a link only the owner has:

```
npm run admin:link -- https://your-site.com          # no expiry
npm run admin:link -- https://your-site.com 30       # valid 30 days
```

It prints one address, `https://your-site.com/owner-access/<token>`. The token is AES-GCM ciphertext under `ADMIN_LINK_SECRET`: nothing in it can be read (not even the expiry date), and no token can be produced without the secret. Every byte is authenticated, so an edited link is not a near miss — it is a 404.

**The link is not a password, and it is not access on its own.** Opening it only unlocks the password screen: it sets a 10-minute cookie scoped to `/owner-access` and redirects to `/owner-access/password`, which asks for the username and password as before. Link **plus** password creates the session. Someone who steals the link still cannot get in; someone who knows the password but has no link has nowhere to type it.

Treat the link as a key all the same: send it over a channel you trust, and keep it out of anything public. `Referrer-Policy: no-referrer` stops it leaking through the Referer header. To revoke every link ever issued, change `ADMIN_LINK_SECRET` and print a new one — that does not change the password. Signing out clears both cookies; coming back means reopening the link.

**Security.**
- Credentials come from the environment only: `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (scrypt, from `npm run admin:password`), `ADMIN_SESSION_SECRET` and `ADMIN_LINK_SECRET` (32+ characters each). There is no default password and no bypass. If any is missing, the console answers 404 everywhere on Vercel; locally it still shows what is left to set, so development is not a guessing game.
- Sessions are HMAC-signed, `HttpOnly`, `SameSite=Strict`, `__Host-` and `Secure` on https, and expire after 12 hours. Changing the password hash or the secret signs everyone out.
- Changes must be same-origin POSTs carrying a custom header. Repeated wrong passwords from one address are slowed down (best effort on serverless; the slow hash is the real defence).
- Admin responses are `no-store`, `noindex, nofollow`, framed nowhere, and carry a strict Content-Security-Policy. Database, storage and session secrets never reach the browser: image URLs are built on the server.

### Photos

Uploads go through the admin API to the bucket with the S3 API (`lib/admin/storage.js`): Cloudflare R2 in production, MinIO or SeaweedFS locally. The browser resizes large photos (longest side 1600px, WebP) and the server accepts JPEG, PNG or WebP up to 4 MB, identified by their bytes. Keys are generated on the server (`products/cafe/12-3fa9c1d2e4.webp`) and only the key is stored in Postgres; public URLs still come from `R2_PUBLIC_BASE_URL`. A replaced or removed photo is deleted from the bucket only when no venue, category or product still uses it. Product photos appear on the public menu as a small arch beside the dish; every photo keeps its coloured placeholder behind it.

Without storage settings, everything else works and the admin says "Image uploads are not configured." ("… configured locally." in development).

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
5. For the admin, a database created before the admin existed needs `db/migrations/001-admin.sql` (safe to run twice; `db/schema.sql` already includes it). Then create a role that may write the menu, but not change the schema, and put its pooled connection string in `ADMIN_DATABASE_URL`:
   ```sql
   create role menu_admin with login password 'REPLACE_WITH_ANOTHER_LONG_RANDOM_PASSWORD';
   grant usage on schema public to menu_admin;
   grant select, update on venues to menu_admin;
   grant select, insert, update, delete on category_groups, categories, menu_items, admin_deletions to menu_admin;
   grant select, insert on admin_audit to menu_admin;
   ```
   Without `ADMIN_DATABASE_URL` the admin uses `DATABASE_URL`, which then must not be the read-only role.

Schema overview (`db/schema.sql`):

| Table | Holds | Notes |
|---|---|---|
| `venues` | name, title, subtitle, eyebrow, description, hero/logo image keys, hero alt, hero crop | Primary key `slug` of enum type `venue` (`restaurant`, `cafe`) |
| `category_groups` | Sidebar headings (“À boire”…) | Per venue, ordered by `position` |
| `categories` | slug (URL fragment), name, note, image key, source provenance | `unique (venue, slug)`; `is_visible` hides without deleting |
| `menu_items` | name, description, `price_millimes`, `is_house`, optional photo key | Composite FK `(venue, category_id)`: an item cannot land in the other venue’s category |
| `admin_audit` | admin history: time, administrator, action, venue, record | Written by `/admin` only; the public site never reads it |
| `admin_deletions` | snapshots of deleted records for Undo | Kept for 15 minutes |

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
6. For uploads from `/admin`: R2 → **Manage R2 API Tokens** → create a token with **Object Read & Write** on this bucket only. Set `S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_REGION=auto` in Vercel. Photos uploaded through the admin need no SQL.

## Build and preview

```sh
npm install
npm test
cp .env.example .env.local   # then fill in DATABASE_URL and R2_PUBLIC_BASE_URL
npm run dev
```

Open http://localhost:4173/restaurant or http://localhost:4173/cafe. `npm run dev` copies the static files into `dist/` and starts a local server that applies the same redirects, rewrites and headers as Vercel, calling the same `api/menu.js` and `api/admin.js`. Without `DATABASE_URL` both routes show the unavailable page. Set `PORT` to use another port. Use Node.js 22.9 or later.

## Local development without Neon or R2

Everything can be reviewed on one machine with a throwaway database and no production secrets. You need PostgreSQL 15+ installed (the server program; it does not need to be running). For photo uploads, also install an S3-compatible service: [SeaweedFS](https://github.com/seaweedfs/seaweedfs/releases) (`weed`) or MinIO (`minio`), on the PATH, in `.local/bin/`, or named by `WEED_BIN` / `MINIO_BIN`.

```sh
npm run local:setup    # once: local Postgres from db/schema.sql + db/seed.sql, admin sign-in, bucket
npm run local:start    # starts them and the site on :4173; Ctrl+C stops everything
```

- `local:setup` creates a separate Postgres cluster in `.local/postgres` on port 54329 (`LOCAL_PG_PORT`), so it never touches another Postgres on the machine, loads the schema and seed, generates a local admin password and session secret, and writes them into a marked block of `.env.local`. It prints the sign-in; `npm run local:status` shows it again. It refuses to overwrite settings you already have in `.env.local` (such as a Neon `DATABASE_URL`) unless you add `-- --force`.
- With SeaweedFS or MinIO it starts a local S3 service on port 8333 (`LOCAL_S3_PORT`) with a public-read bucket, so uploads take the same path as in production: file → S3 API → key in Postgres → preview → public menu. Without one, uploads say "Image uploads are not configured locally." and everything else works.
- `npm run local:reset` recreates the database from schema and seed; `npm run local:stop` stops the services if they were left running.

`.local/` and `.env.local` are git-ignored. None of this is used in production, which reads Neon and R2 only.

## Layout

```
api/menu.js     Vercel function behind /restaurant and /cafe
api/admin.js    Vercel function behind /admin and the /api/admin JSON API
lib/
  handler.js    venue allowlist, status codes, cache headers, asset version
  db.js         public menu queries and row shaping (no fallback data)
  database.js   Neon HTTP for public reads on Neon, node-postgres otherwise and for admin transactions
  render.js     server-rendered page, unavailable and not-found pages, search suggestions
  images.js     R2 object key → public URL, rejecting unsafe keys
  admin/
    handler.js  admin routes, session checks, same-origin checks, uploads
    link.js     the encrypted owner link: the only unauthenticated way in
    auth.js     password hashing, signed session cookies, sign-in throttle
    store.js    every admin read and change: venue-scoped, transactional, audited, undoable
    storage.js  S3-compatible adapter (R2, MinIO, SeaweedFS), key generation, type sniffing
    pages.js    sign-in, setup-needed, overview and editor shell
db/
  schema.sql    tables, enum, constraints, triggers
  seed.sql      the initial 223-item catalogue with source provenance
  migrations/   upgrades for databases created from an earlier schema
src/            static files published by npm run build
  style.css     shared visual system, dark mode, responsive layouts
  menu.js       scroll-spy rail, search, suggestions, history and dialogs
  selection.js  Ma sélection
  search.js     accent-insensitive matching, shared with the server
  admin/        admin styles and scripts (published to /assets/admin/); shared.js validates prices, slugs and names on both sides
  assets/       fonts and favicon (published); entrance/logo derivatives for R2
scripts/
  serve.mjs     local stand-in for Vercel
  local.mjs     local Postgres and S3 service for development
  admin-password.mjs  ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET and ADMIN_LINK_SECRET values
  admin-link.mjs      prints a private owner link
assets-source/  the supplied originals, never published
tests/          node:test suite; helpers read db/seed.sql or load it into PGlite
dist/           build output (git-ignored)
```

## Tests

`npm test` needs no database: it reads `db/seed.sql` back into the same shape `lib/db.js` returns. It covers the schema’s venue separation, catalogue totals, search, rendering of every item and price, compact lists, suggestions, safe embedding of database text, R2 URLs and placeholders, the venue allowlist, and the 503 page showing nothing from the menu when the database is missing or failing.

The admin tests load `db/schema.sql` and `db/seed.sql` into PGlite (Postgres compiled to WebAssembly, a development dependency), so the real SQL runs without a server: ordering, venue isolation, transactions, deletion, Undo and history. They also cover the owner link and its forgery and expiry cases, the 404 given to everyone without a session, sign-in and sessions, same-origin checks, the setup-needed state, upload validation against a recording storage stand-in, S3 request signing, and price and slug validation. No Neon, R2, MinIO or secrets are needed.

## Deployment

Vercel uses the repository root. `vercel.json` runs `npm run build`, publishes `dist`, rewrites `/restaurant` and `/cafe` to `api/menu.js` and `/admin…` and `/owner-access/…` to `api/admin.js`, pins the functions to `fra1`, and keeps the `/`, `/menu-1` and `/menu-2` redirects. Set `DATABASE_URL` and `R2_PUBLIC_BASE_URL` for Production and Preview, and for the admin `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `ADMIN_LINK_SECRET`, `ADMIN_DATABASE_URL` and the `S3_*` settings (see `.env.example`). Then print the owner link with `npm run admin:link -- https://your-site.com`. The site remains `noindex`.
