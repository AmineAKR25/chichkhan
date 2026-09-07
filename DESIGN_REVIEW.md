# Havana — frontend and design review

Historical baseline reviewed 7 September 2026, before the homepage/menu blend. Several findings have since been addressed; see `.design/havana-menu-blend/IMPLEMENTATION.md` for the completed work. Baseline screenshots are local review artifacts, not included in Git.

## Scope and evidence

Reviewed the home page, category index, shared category and product templates, practical information, floating navigation, typography/tokens, menu data and custom not-found page source. Browser review used localhost:3000 at 375 × 812, 768 × 1024 and 1280 × 800. Glaces & Coupes and Coupe Havana were the representative category and product; this was not an exhaustive visual inspection of all 38 product URLs.

No DESIGN_BRIEF.md was found. The source declares a fixed “Nuit de Djerba” direction. The bundled design ZIP contains an eleven-screen, 390px design reference whose introductory text describes alternating light/dark treatments, while the implementation intentionally declares one dark treatment based on screen 05. That difference needs to remain documented; it is not evidence that alternating themes are currently required.

## Design character

A compact digital menu with a cohesive evening atmosphere: charcoal background, fine vertical texture, gold rules and item names, cream prices, Cormorant Garamond display type and Jost utility text. The home page uses a gold arch around the Havana wordmark. Categories share a circular image placeholder, numbered chapter identity and a single accent.

Its structure is straightforward: home → six-category index → category → product detail, plus practical information and an everywhere-available jump menu. The catalogue has 38 products. Category and product pages use real links and static parameter generation; the floating menu is the main client-side component. This is a compact frontend without Café Lounge's database/admin layer.

The strongest qualities are the disciplined palette, restrained price hierarchy, consistent row components, concise chapter navigation and readable composition lists. Allergen markers have explanatory screen-reader text and footnotes. The practical information page gives useful actions in one place. The custom 404 matches the brand in source.

## Must fix

1. **Category pages overflow the mobile viewport.** At 375px, the Glaces & Coupes page measures 385px wide. The circular PhotoSlot extends to x=385 because its `marginRight: -34` exceeds the surrounding 24px padding, and the page does not clip that decorative overflow. This creates real horizontal scrolling. Clip the decoration at the page/hero boundary or adjust the offset while preserving the intended partial circle. Source: `src/components/PhotoSlot.tsx:20` and `src/app/carte/[categorie]/page.tsx`. Evidence: `review-category-mobile-375-viewport.png`.

2. **Floating navigation overlaps the home-page controls.** At 375 × 812 the fixed “Aller à” button sits across the lower Infos pratiques control. The overlap also appears in the desktop home layout. The home page uses `pb-10`, while other pages reserve `pb-32`; the global floating button is rendered on all pages. Reserve enough clearance or omit/reposition the redundant jump action on the opening screen. Source: `src/components/FloatingNav.tsx:33`, `src/app/page.tsx:7` and `src/app/layout.tsx`. Evidence: `review-home-mobile-375-viewport.png`.

3. **The full-screen navigation does not manage keyboard focus as a modal.** On opening it, focus remains on the covered “Aller à” trigger. Pressing Tab moved focus to the underlying development-tool control in the observed local session. The overlay has no dialog role, modal semantics, focus entry/trap/return handling, or inert background. Escape does close it. Implement these behaviors as one coherent overlay. Source: `src/components/FloatingNav.tsx:14–64`. Evidence: `review-navigation-mobile-375-viewport.png`.

## Should fix

1. **The desktop experience remains a phone-width column.** `.screen` caps all pages at 430px with no larger-screen layout. At 1280px, the centre column leaves 850px of combined side space. This can be a deliberate QR-menu presentation, but it is not an adapted desktop experience. If desktop matters, expand the category index and use a considered content layout rather than simply enlarging the phone typography. Source: `src/app/globals.css:70`. Evidence: `review-category-desktop-1280-viewport.png`.

2. **Decorative placeholders occupy the space where food imagery should carry meaning.** PhotoSlot renders gradients and rings, not images. The composition has a strong visual signature, but the repeating circles do not help visitors choose a dish. Retain the crop language and replace placeholders with category-appropriate assets; item data currently has no image field. Source: `src/components/PhotoSlot.tsx`, `src/lib/menu.ts`.

3. **Several controls are visually too small for comfortable touch use.** The overlay close button is a 22px glyph without added hit-area padding, the floating action is about 39px tall, and TopBar's link is content-height within a 56px header. Increase the actual clickable area while retaining the delicate visible design. Source: `src/components/FloatingNav.tsx:33`, `:60`, and `src/components/TopBar.tsx`.

4. **Secondary text is small.** Descriptions are 14px and notes 12px; navigation eyebrows are 11px with substantial tracking. The colours and contrast roles are thoughtful, but comfortable reading at a café table would benefit from larger descriptive text and less reliance on tiny uppercase copy. This is a legibility recommendation, not an assertion that 14px text alone violates accessibility rules. Source: `src/app/globals.css:107`, `:131`.

5. **Some product pages have little additional content.** Every item links to a detail page, but products such as Express have only a name and price. The detail template reserves most of a viewport even when description/composition are absent. Give simple items meaningful details or avoid a largely empty extra navigation step. Source: `src/components/MenuRow.tsx`, `src/app/produit/[slug]/page.tsx`, `src/lib/menu.ts`.

## Could improve

- The outlined “FR” block looks like a language selector but is a static div. Treat it clearly as a language label or implement a selector only when translations exist.
- The fixed floating button can mask menu content while scrolling even where bottom padding makes the end of the page reachable. A reserved navigation area or less intrusive placement would improve reading.
- The category title is absolutely positioned beside/over the decorative circle, with a fixed 200px width. Test longer names and enlarged text before adding categories or translations.
- The stylesheet is compact at 143 lines, but visual values are distributed through repeated inline styles in the pages and components. Extract recurring action/section styles into shared components or tokens as the app grows.
- Site copy includes hours, contact links and venue claims without provenance recorded in the repository. This review did not verify their real-world accuracy. The README is still the default Next.js scaffold text and should explain the actual menu architecture and design choices.

## Validation

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- Browser: home → index → category → product flow; floating-menu navigation to practical information; Escape closure; focus behavior; responsive width measurements.
- Home, index, representative product and information pages had no page-width overflow at the three measured widths. Representative category measured 385px at a 375px viewport; it stayed within the viewport at 768px and 1280px.
- No production build, performance benchmark, comprehensive accessibility audit or real-world venue-content verification was performed.

## Screenshots captured

Screenshots are saved in the repository `screenshots/` folder. The category mobile/desktop, home mobile, and navigation screenshots cited above are the primary visual evidence. Full-page captures and some subsequent viewport captures exhibit browser scaling/stitching artifacts; those artifacts are not reported as application defects. Product-page appearance was inspected in a clean browser capture during the review, but its later saved copy has a scaling artifact.

- `screenshots/review-carte-desktop-1280-viewport.png`
- `screenshots/review-carte-desktop-1280.png`
- `screenshots/review-carte-mobile-375-viewport.png`
- `screenshots/review-carte-mobile-375.png`
- `screenshots/review-carte-tablet-768-viewport.png`
- `screenshots/review-carte-tablet-768.png`
- `screenshots/review-category-desktop-1280-viewport.png`
- `screenshots/review-category-desktop-1280.png`
- `screenshots/review-category-mobile-375-viewport.png`
- `screenshots/review-category-mobile-375.png`
- `screenshots/review-category-tablet-768-viewport.png`
- `screenshots/review-category-tablet-768.png`
- `screenshots/review-home-desktop-1280-viewport.png`
- `screenshots/review-home-desktop-1280.png`
- `screenshots/review-home-mobile-375-viewport.png`
- `screenshots/review-home-mobile-375.png`
- `screenshots/review-home-tablet-768-viewport.png`
- `screenshots/review-home-tablet-768.png`
- `screenshots/review-infos-desktop-1280-viewport.png`
- `screenshots/review-infos-desktop-1280.png`
- `screenshots/review-infos-mobile-375-viewport.png`
- `screenshots/review-infos-mobile-375.png`
- `screenshots/review-infos-tablet-768-viewport.png`
- `screenshots/review-infos-tablet-768.png`
- `screenshots/review-navigation-mobile-375-viewport.png`
- `screenshots/review-product-desktop-1280-viewport.png`
- `screenshots/review-product-desktop-1280.png`
- `screenshots/review-product-mobile-375-viewport.png`
- `screenshots/review-product-mobile-375.png`
- `screenshots/review-product-tablet-768-viewport.png`
- `screenshots/review-product-tablet-768.png`
