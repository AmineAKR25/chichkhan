# Chichkhan — the illuminated arch

14 September 2026. Updated to the user’s title-only direction: photo on the right, no promotional text, and every supplied dish description always visible.

Work directly in the existing root application. The uncommitted repository promotion predates this refresh and must remain intact.

## Audience and task
Guests arriving by QR code need to recognize their venue and find a dish, drink or price quickly. Each route is independent. Preserve the complete 223-item catalogue, original prices, descriptions, notes and provenance. Keep the original entrance photograph and solid colored placeholders below all 31 category headings.

## Analysis
The existing desktop page gives too much space to an isolated photograph and an empty image placeholder. The name, search and category content lack a strong compositional relationship. Mobile navigation occupies 162px below an 80px header. The café's 20-category directory has no meaningful grouping. Search and deep linking are good foundations.

## Direction and tokens
Signature: an architectural arch cut into the photograph, echoing the actual entrance. A compact dark venue-colored hero carries only the venue name; the photo stays on its right on all screen sizes. The menu itself is a quiet, bright reading surface.

Colors: porcelain #f7f8f5; white #ffffff; midnight sea #153c4b for SO; garden #16483c for Café; brass #d9bd82 for decorative hero details; slate #556660 for secondary text. Components use semantic variables with theme overrides, including accessible focus and borders.

Type: locally hosted Cormorant Garamond for venue/category headings and its italic for the venue subtitle; DM Sans for dishes, navigation, prices and controls. Tabular prices. Small caps only for short labels.

Desktop: compact venue header → navy/green hero with left-aligned type and a framed arch photograph → menu introduction → grouped category sidebar + search and category panel. The smaller category placeholder sits beside generous dish rows. A clearly labeled previous/next footer keeps browsing continuous.

Mobile: compact venue header → title and arch photo on the right → compact menu title → two-row sticky category/search toolbar → category heading, shallow color placeholder, dishes. A grouped category dialog includes its own filter, counts and an explicit whole-menu option. No fixed bottom bar competing for reading space.

## Critique of initial options
The skill database's generic conversion funnel and red palette do not fit a QR menu or the established brand; rejected. An oversized full-screen hero would delay the primary task; rejected. Retain the brand's navy/green and add architectural framing, deliberate typography and clearer content grouping. Use no stock images, fake dish descriptions, ratings, hours or ordering controls.

## Validation
Run existing tests; verify catalogue bytes unchanged; desktop/mobile screenshots for both venues; 375/768/1024/1440 layouts and small landscape; category selection and filtering; deep-link/history; whole-menu and scoped search; always-visible breakfast compositions; empty-state recovery; keyboard focus and dialog dismissal. Verify local font/assets and reduced motion.
