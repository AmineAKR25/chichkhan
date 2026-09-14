# Chichkhan

This is a dependency-free static menu application, not a Next.js project.

- Edit `src/`, `build.mjs` and `scripts/`; never edit generated `dist/`.
- `/restaurant` and `/cafe` are independent. Preserve their separation and all menu content, prices and provenance. There is no homepage.
- Keep the supplied hero photograph and colored placeholders beneath category headings.
- Run `npm test` after changes; it builds both routes before checking them.
- `npm run dev` builds and serves locally at http://localhost:4173. Rebuild after source edits.
- Vercel builds from the repository root with `npm run build` and publishes `dist`.
