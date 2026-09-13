# Chichkhan Djerba

Two independent menu sites deployed from this directory by the repository's Vercel configuration. The legacy Havana Next.js app at the repository root is separate.

- `/restaurant`: SO Restaurant Lounge — 73 items across 11 categories.
- `/cafe`: Chichkhan Café — 150 items across 20 categories.

There is no homepage and no chooser. Neither route links to, names or hints at the other: no venue switch, no "see also", no shared landing page. `/` redirects to `/restaurant`, and the previous `/menu-1` and `/menu-2` paths redirect permanently to their new names, so existing links and printed QR codes keep working. Each route is meant to be reached directly, one venue per code.

Each category still has a solid colored image placeholder below its heading. Desktop places the placeholder beside the item list; phone and tablet place it above. No dish photography, stock or generated imagery appears anywhere.

## The hero

Both routes open with the supplied entrance photograph, framed so that neither shows the other venue's identity. The photograph's illuminated sign reads "Chichkhan Café", so the restaurant is cropped low — onto the lit arches, the doorway and the bar — and the café is cropped high, onto its own sign. Both crops come from the one supplied file via `object-position`; there is no second photograph and nothing was generated.

Phone and tablet get a full-bleed band with the venue name over a scrim measured against the photograph beneath it (worst-case 11.3:1 for the name, 7.0:1 for the eyebrow). Desktop places a square panel beside the name instead of a full-bleed band, because the supplied original is only 729px wide and stretching it across a desktop viewport would visibly upscale it.

## Browsing

The first category is selected initially. Desktop uses a category sidebar; mobile and tablet use a native dialog with all categories and item counts. Choosing a category updates its URL fragment and supports deep links and browser back/forward. "Toute la carte" displays every category. Without JavaScript, all menu content and native category anchors remain available.

Search covers the entire active menu, including when a category is selected, and accepts unaccented queries and uppercase ligatures such as `BŒUF`. Results temporarily hide category images to make matching dishes easier to scan. Clearing search restores the selected category. Breakfast composition disclosures expand when included in search results and return to their prior state after clearing. Escape clears search; Command/Ctrl+K focuses it.

No ordering, payment or new venue claims were added. Existing menu contents, prices, notes and source provenance are preserved.

## Build and preview

```sh
npm run build
npm test
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173/restaurant/ or http://localhost:4173/cafe/. The `/` redirect is a Vercel rule, so the local static server shows a directory listing there instead. No dependencies are required. Use a current Node.js release supporting `node:test`.

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

CSS, script and menu data references are versioned from their content during the build to avoid stale assets after updates. An inline script in `<head>` marks the document before first paint, so the toolbar and the selected category are correct immediately rather than after the module collapses a fully expanded catalogue.

## Deployment

The repository-root `vercel.json` builds this directory, publishes `dist` from `main`, and carries the `/`, `/menu-1` and `/menu-2` redirects. This prototype remains `noindex`.
