import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
await stat(root).catch(() => { throw new Error("Build the site first with npm run build."); });
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml",
};

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
    let file = resolve(root, "." + pathname);
    if (!file.startsWith(resolve(root) + sep)) {
      res.writeHead(404).end("Page introuvable");
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
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
