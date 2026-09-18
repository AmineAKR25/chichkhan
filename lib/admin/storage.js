import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { IMAGE_TYPES } from "../../src/admin/shared.js";

// One S3-compatible adapter for every environment: Cloudflare R2 in
// production, a local S3 service (MinIO, SeaweedFS…) in development.
//   S3_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com, or http://127.0.0.1:8333 locally
//   S3_BUCKET             bucket name
//   S3_ACCESS_KEY_ID      R2 API token access key (Object Read & Write, this bucket only)
//   S3_SECRET_ACCESS_KEY  its secret
//   S3_REGION             "auto" for R2 (default)
//   R2_PUBLIC_BASE_URL    public URL that serves the same bucket
// The database stores object keys only; public URLs come from lib/images.js.
// None of these values ever reaches the browser.

export class StorageError extends Error {}

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function storageConfig(env = process.env) {
  const value = (name) => String(env[name] ?? "").trim();
  const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"].filter((name) => !value(name));
  const problems = [];
  let endpoint = null;
  let local = false;
  if (value("S3_ENDPOINT")) {
    try {
      endpoint = new URL(value("S3_ENDPOINT"));
      local = localHosts.has(endpoint.hostname);
      if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) problems.push("S3_ENDPOINT must use https.");
    } catch {
      problems.push("S3_ENDPOINT is not a valid URL.");
    }
  }
  const bucket = value("S3_BUCKET");
  if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) problems.push("S3_BUCKET is not a valid bucket name.");
  return {
    configured: !missing.length && !problems.length,
    missing,
    problems,
    local,
    endpoint: endpoint ? endpoint.origin + endpoint.pathname.replace(/\/+$/, "") : null,
    bucket,
    region: value("S3_REGION") || "auto",
    accessKeyId: value("S3_ACCESS_KEY_ID"),
    secretAccessKey: value("S3_SECRET_ACCESS_KEY"),
  };
}

// Keys are generated here, never taken from the browser. Every upload gets a
// fresh name, so year-long browser caching never shows a stale photo.
export const IMAGE_KEY_PATTERN = /^(venues|categories|products)\/(cafe|restaurant)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(webp|jpg|png)$/;
export function imageKeyFor({ venue, target, slot, id, slug }, contentType) {
  const extension = IMAGE_TYPES[contentType];
  if (!extension) throw new StorageError(`Unsupported image type ${contentType}`);
  const suffix = randomBytes(5).toString("hex");
  const stem = target === "venue" ? slot : target === "category" ? String(slug).slice(0, 40).replace(/-+$/, "") : String(id);
  const folder = target === "venue" ? "venues" : target === "category" ? "categories" : "products";
  const key = `${folder}/${venue}/${stem}-${suffix}.${extension}`;
  if (!IMAGE_KEY_PATTERN.test(key)) throw new StorageError("Could not build a safe image key");
  return key;
}

// The file's first bytes decide its type; the name and declared type do not.
export function sniffImageType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ascii = (start, end) => String.fromCharCode(...b.subarray(start, end));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => b[i] === byte)) return "image/png";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export function createStorage(config, { fetch: fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  if (!config?.configured) return null;
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
    retries: 0,
  });
  const bucketUrl = `${config.endpoint}/${config.bucket}`;
  const objectUrl = (key) => `${bucketUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  // Signs with SigV4 (unsigned payload, which R2, MinIO and SeaweedFS accept)
  // and sends the original body, so no request stream is read twice.
  async function send(url, init = {}, ms = timeoutMs) {
    const signed = await client.sign(url, init);
    return fetchImpl(signed.url, { method: signed.method, headers: signed.headers, body: init.body, signal: AbortSignal.timeout(ms) });
  }
  return {
    local: config.local,
    async putObject(key, body, contentType) {
      if (!IMAGE_KEY_PATTERN.test(key)) throw new StorageError("Refusing to write an unexpected key");
      const response = await send(objectUrl(key), {
        method: "PUT",
        body,
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
      });
      if (!response.ok) throw new StorageError(`Upload failed with status ${response.status}`);
    },
    async deleteObject(key) {
      if (!IMAGE_KEY_PATTERN.test(key)) return false;
      const response = await send(objectUrl(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new StorageError(`Delete failed with status ${response.status}`);
      return true;
    },
    // Used to tell "configured but not running" apart locally.
    async probe(ms = 1500) {
      try {
        const response = await send(bucketUrl, { method: "HEAD" }, ms);
        return response.ok;
      } catch {
        return false;
      }
    },
    // Development helpers for scripts/local.mjs.
    async ensurePublicBucket() {
      const head = await send(bucketUrl, { method: "HEAD" });
      if (head.status === 404) {
        const created = await send(bucketUrl, { method: "PUT" });
        if (!created.ok) throw new StorageError(`Could not create bucket (${created.status}): ${await created.text()}`);
      } else if (!head.ok) {
        throw new StorageError(`Could not reach bucket (${head.status})`);
      }
      const policy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] }, Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${config.bucket}/*`] }],
      });
      const response = await send(`${bucketUrl}?policy=`, { method: "PUT", body: policy, headers: { "Content-Type": "application/json" } });
      return response.ok;
    },
  };
}
