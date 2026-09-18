// Dev-only preview: renders /restaurant and /cafe from db/seed.sql so the menu
// UI can be reviewed without a database connection.
//
// This is NOT a fallback catalogue. The seed loader lives in this script alone:
// api/menu.js and lib/db.js are untouched, so the deployed site still shows no
// venue, category or product when Neon is unreachable. Run it explicitly with
// `npm run preview:seed`; `npm run dev` is unaffected.
import { handleMenuRequest } from "../lib/handler.js";
import { catalogue } from "../tests/helpers/catalogue.mjs";
import { serve } from "./serve.mjs";

// The seed stores no image keys. With R2_PUBLIC_BASE_URL set we synthesise the
// documented key layout so real images load; anything absent from the bucket
// falls back to its coloured placeholder, exactly as in production.
const imageBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const imageKeys = Boolean(imageBaseUrl);

async function loadFromSeed(venue) {
  return catalogue(venue, { imageKeys });
}

async function handler(request) {
  const venue = new URL(request.url).searchParams.get("venue");
  const { status, headers, body } = await handleMenuRequest(venue, {
    env: { R2_PUBLIC_BASE_URL: imageBaseUrl },
    load: loadFromSeed,
  });
  return new Response(body, { status, headers });
}

console.warn("Preview mode: menus come from db/seed.sql, not the database.");
console.warn(imageKeys
  ? `Images from ${imageBaseUrl} (missing objects show their placeholder).`
  : "R2_PUBLIC_BASE_URL is not set: every image shows its coloured placeholder.");
await serve({ handler, label: "Chichkhan (seed preview)" });
