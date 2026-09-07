# Havana — carte digitale

French-language menu for Havana, with the Nuit de Djerba identity: charcoal, cream, antique gold, Cormorant Garamond and Jost. The homepage uses coloured placeholders only. Café Lounge informed the responsive menu navigation; Havana retains its own catalogue and styling.

## Development

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use Node.js 22.18+ (or a newer supported release) to run the TypeScript search tests directly.

## Routes and content

- `/`: original Havana homepage, arch composition and six category links.
- `/carte`: category overview, with a desktop sidebar or mobile category rail.
- `/carte/[categorie]`: server-rendered category and product listings.
- `/produit/[slug]`: existing product details.
- `/infos`: practical information.

`src/lib/menu.ts` holds all 38 products, prices and six categories. `src/lib/site.ts` holds venue details. Confirm those venue details before publication.

The menu search matches names, ingredients and categories, accepts unaccented input, and opens the exact product route. Use the search button or Command/Ctrl+K. Escape closes the dialog; keyboard focus cycles within it and returns to the trigger on dismissal. Without JavaScript, the rendered category links and product pages remain accessible.

## Structure

- `src/app/home.css`: homepage styles, scoped to `.havana-home`.
- `src/app/carte/menu.css`: menu browsing styles, scoped to menu components.
- `src/app/carte/layout.tsx`: server layout supplies compact search/navigation data.
- `src/components/MenuChrome.tsx`: persistent menu navigation and native search dialog.
- `src/lib/menu-search.ts`: accent-insensitive catalogue search.
- `.design/havana-menu-blend/`: design direction and implementation notes.
- `DESIGN_REVIEW.md`: baseline review before this iteration, not a current defect list.

## Validation

```sh
npm run lint
npx tsc --noEmit
npm test
npm run build
```

The build prerenders the homepage, menu index, six categories and 38 product pages. Local review screenshots are ignored by Git.
