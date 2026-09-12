# Chichkhan prototype

A standalone static prototype based on the supplied Chichkhan resources.

- `/`: homepage with two menu entrances.
- `/menu-1`: SO Restaurant Lounge — 73 entries.
- `/menu-2`: Chichkhan Café — 150 entries.

Includes category navigation, scoped search, breakfast composition details, and responsive layouts. See [REVIEW.md](REVIEW.md) for source mapping and content awaiting confirmation.

## Preview

From this directory:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173/. Both menu URLs resolve relative to this standalone server's root. The prototype is not mounted inside the root Havana Next.js application.

## Edit

Edit `dist/menu-data.js`, then run `node build.mjs` to regenerate both menu pages. Edit `dist/index.html` for the homepage, `dist/style.css` for styling, and `dist/menu.js` for search behavior. No dependency installation is required.

The existing private Sites deployment is managed from its original checkout; its hosting identity is intentionally not duplicated here.
