# Chichkhan UI/UX refresh

14 September 2026. Implemented in the existing Chichkhan root project. The earlier uncommitted repository migration was preserved.

## Final design

Both independent routes now use a compact venue title beside an arch-framed entrance photo. The photo remains on the right from a 320px phone to a 1440px desktop. SO retains navy; Café retains green. The original logo and photograph are preserved. Cormorant Garamond and DM Sans are hosted locally with their font licenses.

Per the user's refinement, all promotional hero text and the footer slogan were removed. The visible content is the venue title, menu, category navigation, prices and necessary search guidance. All supplied dish descriptions are always visible, including breakfast compositions; there are no details/summary controls or truncated descriptions.

The menu uses a grouped desktop directory, smaller placeholders, clearer category titles, aligned prices and calmer dish rows. Mobile uses a more compact sticky toolbar and a grouped category dialog with accent-insensitive filtering, counts, clear/reset actions and no-result recovery. Previous/next navigation follows the original category order and returns to the full menu at either end. Search remains scoped to the active venue and restores the previous category when cleared.

## Validation

- `npm test`: all 8 tests pass. Coverage includes route independence, catalogue totals, price separation, search normalization, static content, permanently visible descriptions and complete category directories.
- The entire `src/menu-data.js` is byte-for-byte identical to the pre-refresh copy: 223 entries, 31 categories, all descriptions, prices, notes and provenance preserved.
- Both routes checked at 320×700, 375×812, 768×1024, 1024×800, 1440×1000 and 812×375: no horizontal document overflow; image is to the right of the title; displayed descriptions have positive dimensions.
- Confirmed all 150 café dishes, 20 placeholders and 36 supplied café descriptions appear in the whole-menu view. Static tests cover all 31 placeholders and 223 dishes across both routes.
- Browser-verified category selection, previous selection restoration, direct hash/history navigation, global menu search, uppercase ligatures, two-result category filtering, no-match recovery, Escape dismissal, focus restoration, and Tab/Shift+Tab cycling through the dialog.
- Observed focused category heading 26px below toolbar bottom. Sticky offsets are measured dynamically and adapt to viewport changes.
- All 94 HTML link and asset references resolve, with unique IDs. Font requests return 200 and `font/woff2`. No browser warnings or errors were recorded.
- Checked key text color pairs: contrast ratios from 5.70:1 to 11.36:1. Reduced-motion CSS disables transitions; the final design has no entrance animation.

## Review limits

This was a focused design and interaction check in Chromium, not a complete WCAG audit or real-device Safari test. No new dish details or venue claims were invented. The original catalogue's source questions remain in `REVIEW.md`.

The local preview runs at http://localhost:4174/restaurant and http://localhost:4174/cafe. Changes are local, uncommitted and not deployed.
