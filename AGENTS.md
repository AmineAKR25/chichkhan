# Chichkhan

A small Node.js app on Vercel: static files plus two functions, one rendering the menu pages from Neon Postgres and one serving the private `/admin`. Not a Next.js project.

- Menu data lives only in Neon (`db/schema.sql`, `db/seed.sql`). Do not reintroduce a hard-coded catalogue or a fallback: without a database connection the pages must show no venue, category or product.
- `/restaurant` and `/cafe` are independent. Every query filters by the `venue` enum; neither page links to or names the other. There is no homepage.
- Images come from Cloudflare R2 via `R2_PUBLIC_BASE_URL` + object keys. Keep the coloured placeholder behind every image so missing images degrade gracefully.
- Edit `api/`, `lib/`, `src/`, `db/`, `build.mjs` and `scripts/`; never edit generated `dist/`.
- Run `npm test` after changes; it needs no database.
- `npm run dev` serves locally at http://localhost:4173, reading `.env.local`.
- `/admin` (`api/admin.js`, `lib/admin/`) edits both venues. Admin SQL lives in `lib/admin/store.js`: every statement filters by the validated venue, every change runs in its transaction with the per-venue lock and writes `admin_audit`. Never let one venue's ids reach the other.
- Admin sign-in comes only from `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET`: no default password, no bypass. Database, storage and session secrets never reach the browser.
- Ordering is Move up/Move down on `position` (rewritten 1..n) and only changes the website's display order. "Ma sélection" stays in the browser; there is no ordering, checkout or POS.
- Schema changes go in `db/schema.sql` plus an idempotent file in `db/migrations/` for existing databases.
- `npm run local:setup` then `npm run local:start` run a throwaway Postgres (and a local S3 service when installed) with no production secrets.
