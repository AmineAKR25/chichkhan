# Chichkhan Djerba

Chichkhan is the main application in this repository. It contains two independent menu sites and builds directly from the repository root.

- `/restaurant`: SO Restaurant Lounge — 73 items across 11 categories.
- `/cafe`: Chichkhan Café — 150 items across 20 categories.

There is no homepage and no chooser. Neither route links to, names or hints at the other: no venue switch, no "see also", no shared landing page. `/` redirects to `/restaurant`, and the previous `/menu-1` and `/menu-2` paths redirect permanently to their new names, so existing links and printed QR codes keep working. Each route is meant to be reached directly, one venue per code.

Each category still has a solid colored image placeholder below its heading. Desktop places the placeholder beside the item list; phone and tablet place it above. No dish photography, stock or generated imagery appears anywhere.

## The hero

A compact navy or green hero carries only the venue title and the supplied entrance photograph. The photograph stays on the right at every breakpoint, framed as an arch inspired by the entrance. Restaurant crops exclude the café signage. No marketing headline or descriptive copy is displayed.

The visual system uses locally hosted Cormorant Garamond and DM Sans with their SIL Open Font License files in `src/assets/fonts/`. Menu titles, tabular prices and restrained solid category placeholders carry the page hierarchy.

## Browsing

The first category is selected initially. Desktop has a grouped category sidebar; mobile and tablet use a native dialog with the same groups, counts and an accent-insensitive category filter. The filter has a clear action and empty-state recovery. Previous/next controls follow the catalogue order and lead to the complete menu at either end.

Choosing a category updates its URL fragment and supports deep links and browser back/forward. "Toute la carte" displays every category. Without JavaScript, all menu content and native category anchors remain available. A small bootstrap prevents the entire catalogue from flashing during module loading; it expires automatically if the module fails.

Dish descriptions are always visible, including every breakfast composition. There are no disclosure controls, truncation or collapsed ingredients.

Search covers the entire active menu, including when a category is selected, and accepts unaccented queries and uppercase ligatures such as `BŒUF`. Results temporarily hide category images to make matching dishes easier to scan. Clearing search restores the selected category. Escape clears search; Command/Ctrl+K focuses it. Dialog dismissal restores focus, and measured sticky-control heights keep category headings clear after navigation, wrapping or resizing.

No ordering, payment or new venue claims were added. Existing menu contents, prices, notes and source provenance are preserved.

## Build and preview

```sh
npm run build
npm test
npm run dev
```

Open http://localhost:4173/restaurant or http://localhost:4173/cafe. `npm run dev` builds and starts the local server; rerun `npm run build` after edits, then refresh. `npm run preview` (or `npm start`) serves an existing build. The local server applies the same redirects as Vercel and does not show directory listings. Set `PORT` to use another port. No dependencies are required. Use Node.js 22 or later.

## Layout

Everything under `src/` is edited by hand; everything under `dist/` is generated
by `npm run build` and is git-ignored. Never edit `dist/` — the next build
replaces it.

```
src/          hand-written source
  menu-data.js  both catalogues, route slugs, hero framing, search normalization
  style.css     shared visual system and responsive layouts
  menu.js       category selection, search, history and dialog interactions
  assets/       published WebP/JPEG derivatives (committed; see `npm run assets`)
assets-source/  the supplied originals, never published
build.mjs       renders both routes and copies src/ into dist/
tests/          route independence, totals, price separation, normalization
dist/           build output (git-ignored)
```

## Edit

- `src/menu-data.js`: both catalogues, route slugs, hero framing metadata, source mapping and search normalization.
- `build.mjs`: generates both route documents and copies the static files; run it after changing content or templates.
- `src/style.css`: shared visual system and responsive layouts.
- `src/menu.js`: category selection, search, history and dialog interactions.
- `tests/menu.test.mjs`: route independence, catalogue totals, cross-menu price separation, normalization and static output checks. `npm test` builds first, so it never reads a stale `dist/`.
- `assets-source/`: the supplied originals. They are never copied into the output, so they are not published.
- `npm run assets`: regenerates `src/assets/` from those originals. Needs ImageMagick and `cwebp`, so it is deliberately not part of `npm run build` — the derivatives are committed as source and Vercel's builder never runs it.
- `.design/ux-refresh/`: design brief and validation reports.
- `REVIEW.md`: original source provenance and unresolved source-content questions.

CSS, script and menu data references are versioned from their content during the build to avoid stale assets after updates. A bounded inline bootstrap in `<head>` provides the initial view before enhancement, with a full-catalogue fallback if the module is unavailable.

## Deployment

Vercel should use the repository root as its Root Directory. `vercel.json` runs `npm run build`, publishes `dist`, and carries the `/`, `/menu-1` and `/menu-2` redirects. The site remains `noindex`. The local project and package are named `chichkhan`; the existing Git remote is retained.
