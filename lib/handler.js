import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadMenu } from "./db.js";
import { renderMenuPage, renderNotFound, renderUnavailable } from "./render.js";

// Must match the venue enum in db/schema.sql and the rewrite in vercel.json.
export const VENUES = ["restaurant", "cafe"];

// Cache-busting token for CSS and scripts: the deployment id on Vercel,
// otherwise a hash of the local source files.
function computeAssetVersion() {
  const deployment = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (deployment) return deployment.replace(/[^a-z0-9]/gi, "").slice(-12);
  try {
    const hash = createHash("sha256");
    for (const file of ["style.css", "menu.js", "selection.js", "search.js"])
      hash.update(readFileSync(new URL(`../src/${file}`, import.meta.url)));
    return hash.digest("hex").slice(0, 12);
  } catch {
    return Date.now().toString(36);
  }
}
export const assetVersion = computeAssetVersion();

const html = "text/html; charset=utf-8";

export async function handleMenuRequest(venue, { env = process.env, load = loadMenu } = {}) {
  if (!VENUES.includes(venue)) {
    return { status: 404, headers: { "Content-Type": html, "Cache-Control": "no-store" }, body: renderNotFound({ assetVersion }) };
  }
  let data;
  try {
    data = await load(venue, { databaseUrl: env.DATABASE_URL });
  } catch (error) {
    console.error(`[menu] ${venue} unavailable: ${error.message}${error.cause ? ` (${error.cause.message})` : ""}`);
    return {
      status: 503,
      headers: { "Content-Type": html, "Cache-Control": "no-store", "Retry-After": "30" },
      body: renderUnavailable({ assetVersion }),
    };
  }
  if (!data) {
    return { status: 404, headers: { "Content-Type": html, "Cache-Control": "no-store" }, body: renderNotFound({ assetVersion }) };
  }
  return {
    status: 200,
    // Edge-cached for a minute, then refreshed in the background, so menu
    // edits in Neon appear within about a minute.
    headers: { "Content-Type": html, "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" },
    body: renderMenuPage(data, { assetVersion, imageBaseUrl: env.R2_PUBLIC_BASE_URL }),
  };
}
