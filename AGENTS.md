# Chichkhan

A small Node.js app on Vercel: static files plus one function that renders the menu pages from Neon Postgres. Not a Next.js project.

- Menu data lives only in Neon (`db/schema.sql`, `db/seed.sql`). Do not reintroduce a hard-coded catalogue or a fallback: without a database connection the pages must show no venue, category or product.
- `/restaurant` and `/cafe` are independent. Every query filters by the `venue` enum; neither page links to or names the other. There is no homepage.
- Images come from Cloudflare R2 via `R2_PUBLIC_BASE_URL` + object keys. Keep the coloured placeholder behind every image so missing images degrade gracefully.
- Edit `api/`, `lib/`, `src/`, `db/`, `build.mjs` and `scripts/`; never edit generated `dist/`.
- Run `npm test` after changes; it needs no database.
- `npm run dev` serves locally at http://localhost:4173, reading `.env.local`.
