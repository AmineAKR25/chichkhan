import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { GET as menu } from "../api/menu.js";

// Local stand-in for Vercel: static files from dist/, the same redirects, and
// the same rewrites to the menu function. Reads DATABASE_URL and
// R2_PUBLIC_BASE_URL from .env.local when present (see package.json).
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
await stat(root).catch(() => { throw new Error("Build the site first with npm run build."); });
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
};
// Supports the "/:name(a|b)" form used in vercel.json.
const rewrites = (config.rewrites || []).map((rule) => ({
  pattern: new RegExp(`^${rule.source.replace(/:(\w+)\(([^)]+)\)/g, "(?<$1>$2)")}$`),
  destination: rule.destination,
}));
if (!process.env.DATABASE_URL) console.warn("DATABASE_URL is not set: menu pages will show the unavailable state.");

const server = createServer(async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const normalized = pathname.replace(/\/+$/, "") || "/";
    const redirect = config.redirects.find((rule) => rule.source === normalized);
    if (redirect) {
      res.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination + url.search }).end();
      return;
    }
    for (const rule of rewrites) {
      const match = normalized.match(rule.pattern);
      if (!match) continue;
      const target = new URL(rule.destination.replace(/:(\w+)/g, (_, name) => match.groups[name]), url);
      const response = await menu(new Request(target));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
      return;
    }
    let file = resolve(root, "." + pathname);
    if (!file.startsWith(resolve(root) + sep)) throw new Error("outside dist");
    if ((await stat(file)).isDirectory()) throw new Error("no directory listings");
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Page introuvable");
  }
});

server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log(`Chichkhan: http://localhost:${server.address().port}/restaurant and /cafe`);
});
