# Chichkhan — UI and UX review

12 September 2026. Reviewed against `DESIGN_BRIEF.md` in this directory.

## Scope and analysis

This refresh applies only to the current Chichkhan site in `prototypes/chichkhan`. The mistaken legacy Havana edits were removed before work began. The root application and Vercel deployment configuration are unchanged.

The original site had a coherent paper, green and navy identity, but the 20-category café rail required substantial horizontal browsing. Guests scrolled through long menus, category imagery was absent, and the homepage used an entrance photograph despite the request for colored placeholders. Breakfast composition and scoped search were useful foundations to keep.

## Implemented

- Clear Restaurant and Café entrances, preserving their names and visual identities. Colored arch panels sit below each menu heading. The supplied logo remains; no food or entrance photography is shown.
- A solid colored placeholder below every one of the 31 category headings. On large screens, the image sits beside the item list; on phones and tablets, it sits above the dishes.
- Category selection with a desktop sidebar and a native mobile/tablet dialog. The first category is selected initially. An explicit entire-menu view remains available. Native HTML content and anchors remain usable without JavaScript.
- URL fragments, direct category links, next-category navigation and browser history. The persistent Restaurant/Café switch makes the current menu clear and keeps the other menu accessible.
- Search across the entire active menu, regardless of category selection. Clearing search restores that selection. Images are hidden in results to keep relevant dishes compact; empty results explain search scope and provide recovery.
- Breakfast compositions reveal matching content during search and restore the previous disclosure state afterwards. Labels distinguish opening and closing the composition.
- Larger reading text, aligned tabular prices, keyboard focus, touch-sized controls and reduced-motion support.
- Content hashes on CSS, script and menu-data references prevent stale preview/deployment assets. Build paths no longer depend on the caller's working directory.

## Validation

- Prototype build and all four regression tests pass.
- Deep comparison against HEAD confirms all 223 menu items, prices, descriptions, categories, notes and provenance are preserved exactly. The only change in the menu-data module is search normalization for uppercase Œ.
- All 109 local links, fragments and assets in the three generated pages resolve; no duplicate IDs found.
- Reviewed homepage, restaurant and café at 375×812, 768×1024 and 1280×800. No document-level horizontal overflow in any of the nine checks.
- Verified all 31 category image areas are present, have positive dimensions and sit below their headings in the entire-menu view.
- Tested category selection, whole-menu mode, deep links, back/forward history and sticky navigation clearance. Category heading top was 262px with toolbar bottom at 240px on mobile.
- Tested search outside the current category, accent/ligature normalization, no-match recovery and restoration of the selected category. BŒUF EFFILOCHE returns two café matches; restaurant and café Margherita prices remain distinct.
- Tested breakfast disclosure expansion and state restoration, dialog Tab cycling, Escape dismissal and focus restoration to the category trigger.
- Static-output tests confirm every original dish, price and supplied description remains in the HTML for clients without JavaScript.

## Outcome and limits

No blocking defects remain in the reviewed flows. The new layout makes menu selection explicit, gives every category an image slot and keeps the active category and search scope clear.

This is a design and interaction review, not a complete WCAG audit or a real-device Safari test. Existing source ambiguities documented in the original `REVIEW.md` remain for the owner to resolve; no menu facts were invented. Browser full-page captures can exhibit scaling/stitching artifacts, so viewport captures and DOM geometry were used together to assess layout.

## Screenshots captured

The ignored `screenshots/` directory contains home, restaurant and café captures at desktop-1280, tablet-768 and mobile-375, plus `-full` variants. Interactive captures document the mobile category dialog, expanded breakfast composition, search results and empty recovery.

The changes are local and have not been committed or pushed.

## Addendum — independent routes and entrance hero

12 September 2026.

The chooser homepage was removed and the two menus became standalone sites at `/restaurant` and `/cafe`. Every cross-reference is gone: the header venue switch, the "deux cartes" note, the back link to the chooser, the sidebar "voir aussi", the "et de l'autre côté" panel, and the other-venue link in the empty search state. A regression test now asserts that neither generated document contains the other venue's name or a link to its route, so the separation cannot silently regress. `/`, `/menu-1` and `/menu-2` redirect from `vercel.json`.

Both routes open with the supplied entrance photograph. Its illuminated sign reads "Chichkhan Café", which would have put the other venue's name on the restaurant page, so the photograph is framed per route through `object-position`: the restaurant low on the arches, doorway and bar, the café high on its own sign. One file, two crops, nothing generated.

Layout follows from the source resolution. At 729x1300 the photograph supports a full-bleed band on phone and tablet but not on desktop, so desktop places a square panel beside the venue name instead of stretching it. The mobile plate sits over a scrim that was measured against the composed pixels rather than assumed: 11.3:1 for the name and 7.0:1 for the eyebrow, both above AA. On a 375x667 phone the search field and the category selector stay above the fold; the first dish needs a short scroll.

Also changed while in the same files: the published payload now carries WebP derivatives and a 96px logo instead of a 1080px one, the previously orphaned 295KB original moved out of `dist` into `assets-source/`, and an inline head script sets the pre-paint state so the page no longer paints the whole catalogue and then collapses it (7506px to 1894px on the restaurant route before; identical now). The dead `.back-link` rules and all homepage CSS went with the markup, taking the stylesheet from 1128 to 763 lines.

Verified: 5/5 tests, both routes at 375x667, 375x812, 768x1024 and 1280x800, no horizontal overflow, no duplicate IDs, no dead fragments or asset paths, no-JS output intact at 20 sections and 150 dishes, and the category dialog, deep links, history, scoped search, empty state and disclosure restore all still working. `aria-expanded` on the category trigger now mirrors the dialog's `open` attribute, because the `close` event does not fire in every engine.

## Repository promotion — 13 September 2026

Chichkhan was promoted from `prototypes/chichkhan` to the repository root, and the local folder and package were renamed `chichkhan`. Legacy Havana source, tooling and dependencies were removed from the working project and backed up outside it. The Chichkhan UI, catalogue, assets and route behavior were preserved. Build and test commands now run at the root, and Vercel publishes root `dist`. These migration changes have not been committed or pushed.

Migration validation: all 6 regression tests pass; 14 source, asset, build and existing test files match the pulled version byte-for-byte. All 12 local HTTP checks pass, including both menus, legacy redirects, assets, missing pages, directory-listing prevention and request methods.
