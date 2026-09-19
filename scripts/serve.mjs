import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as admin from "../api/admin.js";
import { GET as menu } from "../api/menu.js";

// Local stand-in for Vercel: static files from dist/, the same redirects,
// rewrites and headers as vercel.json, and the same functions (menu and
// admin). Reads DATABASE_URL, R2_PUBLIC_BASE_URL and the admin settings from
// .env.local when present (see package.json).
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const uploadsDir = fileURLToPath(new URL("../.local/uploads/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
};
// Vercel refuses function request bodies above 4.5 MB; so does this server.
const MAX_BODY = 4.5 * 1024 * 1024;

// Supports the "/:name(a|b)", bare "/:name" and "(.*)" forms used in
// vercel.json. A bare parameter matches one path segment, as Vercel does.
const toPattern = (source) => new RegExp(`^${source
  .replace(/:(\w+)\(([^)]+)\)/g, "(?<$1>$2)")
  .replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// `handler` answers the rewritten /api/menu request; scripts/preview-seed.mjs
// passes one that reads db/seed.sql instead of the database.
export async function serve({ handler = menu, label = "Chichkhan" } = {}) {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  await stat(root).catch(() => { throw new Error("Build the site first with npm run build."); });
  // Photos, locally: unless a real S3 service is configured, the admin writes
  // into .local/uploads and this server hands the same files back under
  // /uploads, so uploading and cropping can be tried with nothing installed.
  // Both variables are set here only, so nothing of this reaches Vercel.
  const port = Number(process.env.PORT || 4173);
  if (!process.env.S3_ENDPOINT && !process.env.LOCAL_UPLOADS_DIR) {
    process.env.LOCAL_UPLOADS_DIR = uploadsDir;
    process.env.R2_PUBLIC_BASE_URL ||= `http://127.0.0.1:${port}/uploads`;
    await mkdir(uploadsDir, { recursive: true });
  }
  const rewrites = (config.rewrites || []).map((rule) => ({ pattern: toPattern(rule.source), destination: rule.destination }));
  const headerRules = (config.headers || []).map((rule) => ({ pattern: toPattern(rule.source), headers: rule.headers }));
  const functions = { "/api/menu": { GET: handler }, "/api/admin": admin };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(url.pathname);
      const normalized = pathname.replace(/\/+$/, "") || "/";
      const extra = {};
      for (const rule of headerRules) if (rule.pattern.test(normalized)) for (const { key, value } of rule.headers) extra[key.toLowerCase()] = value;
      const redirect = config.redirects.find((rule) => rule.source === normalized);
      if (redirect) {
        res.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination + url.search }).end();
        return;
      }
      let target = functions[normalized] ? url : null;
      for (const rule of rewrites) {
        const match = !target && normalized.match(rule.pattern);
        if (!match) continue;
        target = new URL(rule.destination.replace(/:(\w+)/g, (_, name) => match.groups[name]), url);
        // Like Vercel, the original query string is kept alongside the rewrite's own.
        for (const [key, value] of url.searchParams) if (!target.searchParams.has(key)) target.searchParams.append(key, value);
      }
      if (target) {
        const fn = functions[target.pathname];
        const call = fn?.[req.method === "HEAD" ? "GET" : req.method];
        if (!call) {
          res.writeHead(405, { Allow: Object.keys(fn ?? { GET: 1 }).join(", ") }).end();
          return;
        }
        const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
        const response = await call(new Request(target, { method: req.method === "HEAD" ? "GET" : req.method, headers, body }));
        const out = { ...extra };
        for (const [name, value] of response.headers) if (name !== "set-cookie") out[name] = value;
        const cookies = response.headers.getSetCookie();
        if (cookies.length) out["Set-Cookie"] = cookies;
        res.writeHead(response.status, out);
        res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      // Photos written by the admin, served the way the R2 bucket serves them.
      const uploaded = normalized.startsWith("/uploads/");
      const base = uploaded ? uploadsDir : root;
      const file = resolve(base, "." + (uploaded ? pathname.slice("/uploads".length) : pathname));
      if (!file.startsWith(resolve(base) + sep)) throw new Error("outside the served folder");
      if ((await stat(file)).isDirectory()) throw new Error("no directory listings");
      const content = await readFile(file);
      res.writeHead(200, {
        ...extra,
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Length": content.length,
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (res.headersSent) return res.end();
      if (error.status === 413) res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" }).end("Request Entity Too Large");
      else res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Page introuvable");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const base = `http://localhost:${server.address().port}`;
    console.log(`${label}: ${base}/restaurant and ${base}/cafe`);
    console.log(`Admin: open a private link with \`npm run admin:link -- ${base}\` (/admin is 404 without a session).`);
    // Say where photos go, so "uploads are off" is never a mystery again.
    if (process.env.LOCAL_UPLOADS_DIR === uploadsDir) console.log(`Photos: saved to .local/uploads and served at ${base}/uploads — no S3 service needed.`);
    else if (process.env.S3_ENDPOINT) console.log(`Photos: S3 at ${process.env.S3_ENDPOINT}, served from ${process.env.R2_PUBLIC_BASE_URL}.`);
  });
  return server;
}

// Only when run directly, so preview-seed.mjs can import serve() without
// starting a second server.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.env.DATABASE_URL) console.warn("DATABASE_URL is not set: menu pages will show the unavailable state.");
  await serve();
}
