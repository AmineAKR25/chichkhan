// Images live in a public Cloudflare R2 bucket. The database stores object
// keys such as "categories/cafe/glaces.webp"; R2_PUBLIC_BASE_URL is the
// bucket's public domain. Anything missing or malformed yields null, and the
// page shows the coloured placeholder instead.
export function imageUrl(baseUrl, key) {
  if (!baseUrl || !key) return null;
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  const local = base.hostname === "localhost" || base.hostname === "127.0.0.1";
  if (base.protocol !== "https:" && !(local && base.protocol === "http:")) return null;
  const segments = String(key).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  const path = base.pathname.replace(/\/+$/, "");
  return `${base.origin}${path}/${segments.map(encodeURIComponent).join("/")}`;
}
