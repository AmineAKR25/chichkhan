# Chichkhan — complete menu UX refresh

Scope: only prototypes/chichkhan, the current Vercel-deployed site. Do not edit the legacy Havana app or change deployment selection. Preserve both menus, all 223 entries and their prices, descriptions, notes and provenance.

Audience: guests choosing food or drinks on a phone. Homepage makes the Restaurant and Café choices explicit; each menu retains its own search and category context.

Design: retain Chichkhan's paper #f9f8f2, garden #1b503e, navy #173e50, gold #cba85b and Georgia/Avenir typography. Use navy for SO, green for Café, and soft solid category colors for image placeholders. Keep the supplied logo; replace the entrance photograph with a colored layout. No dish photos, stock or generated imagery.

Image layout: category heading and item count, then a landscape colored placeholder, then descriptions and prices. This reserves a predictable photo crop without putting text over it. Every one of the 31 categories gets a placeholder. Hide image areas in search results to prioritize relevant items. Home menu cards also place their colored image area under the menu heading.

UX: replace the 20-link mobile scrolling rail with a native category dialog; desktop keeps an independently scrollable sidebar. Category links select one section, update the URL fragment, and support browser back/forward and direct linking. Offer an explicit entire-menu view. With JavaScript off, all sections and native anchor links remain available. Search always covers the active restaurant/café menu, even when one category is selected; clearing it restores that selection. Switching categories clears the query explicitly through navigation. Keep long breakfast descriptions in accessible details with a clear disclosure state. Show currency consistently and do not invent ingredients, allergens, availability or contact information.

Signature: the two menu identities share quiet arch silhouettes inside solid color panels on the homepage; menu category image areas remain flat and rectangular with restrained corners. This applies the existing brand rather than the previous unrelated Havana treatment.

Verification: home and both menus at 375/768/1280; all 31 category images; scoped/accent-insensitive search and recovery; category deep links, history, dialog focus/escape, composition details, no-JS output, local links/assets, build and data integrity.

Final responsive refinement: the desktop category heading spans an image/list split, keeping the placeholder beneath the heading and prices visible beside it. Mobile and tablet retain the vertical heading → image → dishes order. The first category is selected initially; the complete-menu view remains explicit.
