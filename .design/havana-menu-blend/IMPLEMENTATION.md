# Havana homepage and menu blend

Completed 7 September 2026.

## Delivered

- Original homepage: oversized Havana wordmark, offset arch composition, coloured placeholders, six category entry points and practical-information links.
- Responsive menu layout: desktop sidebar, mobile/tablet category rail, active category indicators and category overview cards.
- Catalogue search by name, ingredient and category, including unaccented queries. Results use exact product URLs.
- Native modal with input focus, explicit Tab cycling, Escape and trigger focus restoration. Empty queries show categories; no-match queries offer recovery.
- Category pages retain server-rendered content and existing URLs. Decorative overflow is contained.
- Existing 38 products, prices, product page templates and practical-information content remain intact.
- Café Lounge is a reference only; none of its source files were changed for this implementation.

## Validation

- ESLint passed.
- TypeScript passed independently and during the production build.
- Five search tests passed (`npm test`).
- Production build passed, prerendering 50 pages, including six categories and 38 products.
- Browser checked home and menu layouts at 375, 768 and 1280px; no document-level horizontal overflow observed.
- Browser checked all six category links and the search-to-Coupe-Havana product flow using the unaccented ingredient query `pecan`.
- Tab cycles from the final search result to the close button; Escape closes the dialog and returns focus to the search trigger.
- Menu uses the existing reduced-motion rule and adds no motion-dependent functionality.

Local screenshots are in this directory's ignored `screenshots/` folder. Product/information page designs are outside this iteration. No generated or photographic image assets were added, and no dependencies were added.
