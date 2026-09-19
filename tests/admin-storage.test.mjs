// The S3-compatible storage adapter (R2 in production, MinIO or SeaweedFS
// locally), exercised against a recording fetch: no network, no credentials.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { IMAGE_KEY_PATTERN, createDiskStorage, createStorage, imageKeyFor, sniffImageType, storageConfig } from "../lib/admin/storage.js";
import { uploadStatus } from "../lib/admin/handler.js";

const r2 = {
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_BUCKET: "chichkhan-menu",
  S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
  S3_SECRET_ACCESS_KEY: "secret-example",
  R2_PUBLIC_BASE_URL: "https://images.example.com",
};

test("storage is configured only with every setting, over https unless local", () => {
  assert.equal(storageConfig({}).configured, false);
  assert.deepEqual(storageConfig({}).missing, ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"]);
  const config = storageConfig(r2);
  assert.equal(config.configured, true);
  assert.equal(config.region, "auto");
  assert.equal(config.local, false);
  assert.equal(storageConfig({ ...r2, S3_ENDPOINT: "http://storage.example.com" }).configured, false);
  const local = storageConfig({ ...r2, S3_ENDPOINT: "http://127.0.0.1:8333", S3_REGION: "us-east-1" });
  assert.equal(local.configured, true);
  assert.equal(local.local, true);
  assert.equal(storageConfig({ ...r2, S3_BUCKET: "Bad_Bucket" }).configured, false);
});

test("a file's type comes from its bytes, never its name", () => {
  const bytes = (...values) => new Uint8Array(values);
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffImageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  for (const text of ["<svg xmlns='http://www.w3.org/2000/svg'>", "<html>", "GIF89a", ""]) assert.equal(sniffImageType(new TextEncoder().encode(text)), null, text);
});

test("object keys are generated on the server, per venue, and unique", () => {
  const keys = [
    imageKeyFor({ venue: "cafe", target: "product", id: 12 }, "image/webp"),
    imageKeyFor({ venue: "restaurant", target: "category", slug: "pates" }, "image/jpeg"),
    imageKeyFor({ venue: "cafe", target: "venue", slot: "hero" }, "image/png"),
  ];
  assert.match(keys[0], /^products\/cafe\/12-[a-f0-9]{10}\.webp$/);
  assert.match(keys[1], /^categories\/restaurant\/pates-[a-f0-9]{10}\.jpg$/);
  assert.match(keys[2], /^venues\/cafe\/hero-[a-f0-9]{10}\.png$/);
  assert.notEqual(imageKeyFor({ venue: "cafe", target: "product", id: 12 }, "image/webp"), keys[0]);
  assert.throws(() => imageKeyFor({ venue: "cafe", target: "product", id: 1 }, "image/svg+xml"));
  for (const key of ["../x.webp", "products/bar/1.webp", "products/cafe/1.svg", "/products/cafe/1.webp", "products/cafe/a/b.webp"]) assert.equal(IMAGE_KEY_PATTERN.test(key), false, key);
  assert.equal(IMAGE_KEY_PATTERN.test("categories/cafe/glaces.webp"), true, "keys from the README's manual uploads");
});

test("uploads and deletions are signed S3 requests to the bucket", async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: new Headers(init.headers), body: init.body });
    return new Response(null, { status: init.method === "DELETE" && url.includes("missing") ? 404 : 200 });
  };
  const storage = createStorage(storageConfig(r2), { fetch });
  await storage.putObject("products/cafe/12-0123456789.webp", new Uint8Array([1, 2, 3]), "image/webp");
  const put = calls[0];
  assert.equal(put.method, "PUT");
  assert.equal(put.url, "https://account.r2.cloudflarestorage.com/chichkhan-menu/products/cafe/12-0123456789.webp");
  assert.match(put.headers.get("authorization"), /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[^,]+, Signature=[a-f0-9]{64}$/);
  assert.equal(put.headers.get("x-amz-content-sha256"), "UNSIGNED-PAYLOAD");
  assert.equal(put.headers.get("content-type"), "image/webp");
  assert.match(put.headers.get("cache-control"), /immutable/);
  assert.deepEqual([...put.body], [1, 2, 3]);

  await storage.deleteObject("products/cafe/missing-0123456789.webp");
  assert.equal(calls[1].method, "DELETE");
  await assert.rejects(storage.putObject("../../etc/passwd", new Uint8Array(1), "image/png"));
  assert.equal(await storage.deleteObject("not/a/managed/key.txt"), false);
  assert.equal(calls.length, 2, "unexpected keys never reach storage");

  const failing = createStorage(storageConfig(r2), { fetch: async () => new Response("denied", { status: 403 }) });
  await assert.rejects(failing.putObject("products/cafe/1-0123456789.png", new Uint8Array(1), "image/png"), /403/);
  assert.equal(await failing.probe(), false);
  assert.equal(createStorage(storageConfig({})), null);
});

// The development stand-in: a folder behaving like the bucket, so photos can
// be uploaded and cropped locally with no S3 service installed.
test("the local folder storage writes, deletes and refuses keys it did not make", async () => {
  const dir = join(tmpdir(), `chichkhan-uploads-${randomUUID()}`);
  const disk = createDiskStorage(dir);
  assert.equal(disk.disk, true);
  assert.equal(disk.local, true);
  assert.equal(await disk.probe(), true);

  const key = imageKeyFor({ venue: "restaurant", target: "category", slug: "entrees" }, "image/webp");
  await disk.putObject(key, new Uint8Array([1, 2, 3, 4]), "image/webp");
  assert.deepEqual([...(await readFile(join(dir, key)))], [1, 2, 3, 4]);

  // Only keys this module builds are ever written, and never outside the folder.
  await assert.rejects(() => disk.putObject("../escape.webp", new Uint8Array([0]), "image/webp"), /unexpected key/i);
  await assert.rejects(() => disk.putObject("products/restaurant/../../escape.webp", new Uint8Array([0]), "image/webp"), /unexpected key/i);
  await assert.rejects(() => disk.putObject(key, new Uint8Array([0]), "image/gif"), /Unsupported image type/);

  assert.equal(await disk.deleteObject(key), true);
  await assert.rejects(() => readFile(join(dir, key)));
  assert.equal(await disk.deleteObject(key), true); // deleting twice is fine
  await rm(dir, { recursive: true, force: true });
});

test("uploads are enabled by the local folder, and never on Vercel", async () => {
  const dir = join(tmpdir(), `chichkhan-uploads-${randomUUID()}`);
  const disk = createDiskStorage(dir);
  const local = await uploadStatus({ LOCAL_UPLOADS_DIR: dir }, disk);
  assert.equal(local.enabled, true);
  assert.equal(local.local, true);
  // Without any storage the console still says so rather than pretending.
  assert.equal((await uploadStatus({}, null)).enabled, false);
  assert.equal((await uploadStatus({ VERCEL: "1" }, null)).enabled, false);
});
