// /admin and /api/admin end to end through handleAdminRequest, with an
// in-process Postgres (PGlite) and a recording stand-in for S3 storage.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { LoginThrottle, hashPassword } from "../lib/admin/auth.js";
import { handleAdminRequest } from "../lib/admin/handler.js";
import { renderMenuPage } from "../lib/render.js";
import { catalogue } from "./helpers/catalogue.mjs";
import { closeTemplate, freshDatabase } from "./helpers/pglite.mjs";

after(closeTemplate);

const origin = "http://localhost:4173";
const password = "a long local test password";
const env = {
  ADMIN_USERNAME: "owner",
  ADMIN_PASSWORD_HASH: await hashPassword(password),
  ADMIN_SESSION_SECRET: "test-session-secret-".repeat(3),
  DATABASE_URL: "postgres://user:db-password-never-shown@db.example/menu",
  R2_PUBLIC_BASE_URL: "https://images.example.com",
};
const storageEnv = { S3_ENDPOINT: "https://account.r2.cloudflarestorage.com", S3_BUCKET: "chichkhan-menu", S3_ACCESS_KEY_ID: "AKIDEXAMPLE", S3_SECRET_ACCESS_KEY: "s3-secret-never-shown" };
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    local: false,
    async putObject(key, body, type) { objects.set(key, { size: body.length, type }); },
    async deleteObject(key) { objects.delete(key); return true; },
    async probe() { return true; },
  };
}

async function setup({ withStorage = false, overrides = {} } = {}) {
  const database = await freshDatabase();
  const opened = [];
  const storage = withStorage ? fakeStorage() : null;
  const options = {
    env: { ...env, ...(withStorage ? storageEnv : {}), ...overrides },
    openDb: (url) => (opened.push(url), database.db),
    storage,
    throttle: new LoginThrottle(),
  };
  const call = (path, init = {}) => handleAdminRequest(new Request(`${origin}${path}`, init), options);
  return { ...database, opened, storage, options, call };
}

const same = { origin, "sec-fetch-site": "same-origin", host: "localhost:4173" };
async function signIn(call, { username = "owner", pass = password, next = "" } = {}) {
  const body = new URLSearchParams({ username, password: pass, next });
  return call("/api/admin?page=login", { method: "POST", headers: { ...same, "content-type": "application/x-www-form-urlencoded" }, body });
}
async function session(call) {
  const response = await signIn(call);
  assert.equal(response.status, 303);
  return response.headers.get("set-cookie").split(";")[0];
}
const post = (call, cookie, op, body, headers = {}) => call(`/api/admin?op=${op}`, {
  method: "POST",
  headers: { ...same, cookie, "content-type": "application/json", "x-chichkhan-admin": "1", ...headers },
  body: JSON.stringify(body),
});

function assertPrivate(response) {
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy"), /script-src 'self'; .*frame-ancestors 'none'/);
}

test("without admin settings every route shows setup-needed and grants nothing", async () => {
  const { call, opened, close } = await setup({ overrides: { ADMIN_USERNAME: "", ADMIN_PASSWORD_HASH: "", ADMIN_SESSION_SECRET: "" } });
  try {
    for (const page of ["dashboard", "cafe", "restaurant", "login"]) {
      const response = await call(`/api/admin?page=${page}`);
      assert.equal(response.status, 503);
      assertPrivate(response);
      const html = await response.text();
      assert.match(html, /Configuration requise/);
      assert.match(html, /noindex,nofollow/);
      assert.ok(!/Chichkhan Café|SO Restaurant/.test(html));
    }
    const api = await call("/api/admin?op=state&venue=cafe");
    assert.equal(api.status, 503);
    assert.equal((await api.json()).error.code, "setup-needed");
    const login = await signIn(call);
    assert.equal(login.status, 503);
    assert.equal(opened.length, 0, "the database is never touched");
  } finally {
    await close();
  }
});

test("pages redirect to sign-in and every API action refuses without a session", async () => {
  const { call, opened, close } = await setup();
  try {
    const dashboard = await call("/api/admin?page=dashboard");
    assert.equal(dashboard.status, 303);
    assert.equal(dashboard.headers.get("location"), "/admin/login");
    const editor = await call("/api/admin?page=cafe&category=4");
    assert.equal(editor.headers.get("location"), `/admin/login?next=${encodeURIComponent("/admin/cafe?category=4")}`);
    for (const op of ["state", "audit", "overview"]) assert.equal((await call(`/api/admin?op=${op}&venue=cafe`)).status, 401);
    for (const op of ["product.update", "product.delete", "category.move", "group.delete", "undo", "image.remove", "image.upload"]) {
      const response = await post(call, "", op, { venue: "cafe", id: 1 });
      assert.equal(response.status, 401, op);
      assert.equal((await response.json()).error.code, "signed-out");
    }
    const forged = await post(call, "chichkhan_admin=eyJ1Ijoib3duZXIifQ.AAAA", "product.delete", { venue: "cafe", id: 1 });
    assert.equal(forged.status, 401);
    assert.equal(opened.length, 0);
  } finally {
    await close();
  }
});

test("sign-in checks the password, sets a signed cookie and only returns to admin pages", async () => {
  const { call, close } = await setup();
  try {
    const wrong = await signIn(call, { pass: "wrong password here" });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.headers.get("set-cookie"), null);
    assert.match(await wrong.text(), /L’identifiant ou le mot de passe est incorrect/);
    assert.equal((await signIn(call, { username: "admin" })).status, 401);

    const ok = await signIn(call, { next: "/admin/cafe?category=3" });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/admin/cafe?category=3");
    assert.match(ok.headers.get("set-cookie"), /^chichkhan_admin=[\w-]+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/);
    for (const next of ["//evil.example", "https://evil.example/admin", "/admin/../cafe", "/admin/bar", "/cafe"]) {
      assert.equal((await signIn(call, { next })).headers.get("location"), "/admin", next);
    }
    const crossSite = await call("/api/admin?page=login", { method: "POST", headers: { origin: "https://evil.example", host: "localhost:4173", "content-type": "application/x-www-form-urlencoded" }, body: `username=owner&password=${encodeURIComponent(password)}` });
    assert.equal(crossSite.status, 403);
    assert.equal(crossSite.headers.get("set-cookie"), null);

    const cookie = ok.headers.get("set-cookie").split(";")[0];
    const logout = await call("/api/admin?page=logout", { method: "POST", headers: { ...same, cookie } });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get("location"), "/admin/login?signedout=1");
    assert.match(logout.headers.get("set-cookie"), /chichkhan_admin=; .*Max-Age=0/);
    assert.equal((await call("/api/admin?page=logout", { headers: { cookie } })).status, 303, "GET never signs out");
  } finally {
    await close();
  }
});

test("repeated wrong passwords are throttled", async () => {
  const { call, close, options } = await setup();
  options.throttle = new LoginThrottle({ limit: 3 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await signIn(call, { pass: "nope nope nope" })).status, 401);
    const blocked = await signIn(call);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  } finally {
    await close();
  }
});

test("the dashboard summarises both venues; the editor embeds only its own venue", async () => {
  const { call, close } = await setup();
  try {
    const cookie = await session(call);
    const dashboard = await call("/api/admin?page=dashboard", { headers: { cookie } });
    assert.equal(dashboard.status, 200);
    assertPrivate(dashboard);
    const html = await dashboard.text();
    for (const text of ["Vos menus", "Activité récente", 'href="/admin/cafe"', 'href="/admin/restaurant"', "Gérer le menu"]) assert.ok(html.includes(text), text);
    // No list of things to fix: the admin changes things inside each menu.
    for (const text of ["Needs attention", "without a photo", "No hero photo"]) assert.ok(!html.includes(text), text);
    assert.match(html, /<dt>Produits visibles<\/dt><dd>150<\/dd>/);
    assert.match(html, /<dt>Catégories<\/dt><dd>11<\/dd>/);

    const editor = await call("/api/admin?page=restaurant", { headers: { cookie } });
    assert.equal(editor.status, 200);
    assertPrivate(editor);
    const page = await editor.text();
    const data = JSON.parse(page.match(/<script type="application\/json" id="admin-data">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.venue, "restaurant");
    assert.equal(data.state.products.length, 73);
    assert.ok(data.state.products.every((product) => product.categoryId && product.imageUrl === null));
    assert.ok(!page.includes("Chichkhan Café"));
    // No secret reaches the page.
    for (const secret of [env.ADMIN_SESSION_SECRET, env.ADMIN_PASSWORD_HASH, "db-password-never-shown", "s3-secret-never-shown", "AKIDEXAMPLE"]) assert.ok(!page.includes(secret), "secret leaked");
    assert.equal(data.state.uploads.enabled, false);
    assert.equal(data.state.uploads.message, "L’envoi d’images n’est pas configuré en local.");
    assert.equal((await call("/api/admin?page=bar", { headers: { cookie } })).status, 404);
  } finally {
    await close();
  }
});

test("changes need the admin header and the same origin; venues cannot be crossed", async () => {
  const { call, close, pg } = await setup();
  try {
    const cookie = await session(call);
    const lasagne = (await pg.query("select id, category_id from menu_items where venue = 'restaurant' and name = 'Lasagne'")).rows[0];
    const input = { venue: "restaurant", id: lasagne.id, name: "Lasagne", description: "", price: "33", categoryId: lasagne.category_id, isVisible: true, isHouse: false };
    assert.equal((await post(call, cookie, "product.update", input, { "x-chichkhan-admin": "" })).status, 403);
    assert.equal((await post(call, cookie, "product.update", input, { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status, 403);
    const wrongType = await call("/api/admin?op=product.update", { method: "POST", headers: { ...same, cookie, "x-chichkhan-admin": "1", "content-type": "text/plain" }, body: JSON.stringify(input) });
    assert.equal(wrongType.status, 415);

    const saved = await post(call, cookie, "product.update", input);
    assert.equal(saved.status, 200);
    assertPrivate(saved);
    const result = await saved.json();
    assert.equal(result.message, "Le prix de Lasagne a été mis à jour : 33.000 DT.");
    assert.equal(result.state.products.find((p) => p.id === lasagne.id).millimes, 33000);

    const invalid = await post(call, cookie, "product.update", { ...input, price: "-1" });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error.fields.price, /négatif/);

    const crossed = await post(call, cookie, "product.update", { ...input, venue: "cafe" });
    assert.equal(crossed.status, 404);
    assert.equal((await pg.query("select price_millimes from menu_items where id = $1", [lasagne.id])).rows[0].price_millimes, 33000);
    assert.equal((await post(call, cookie, "product.update", { ...input, venue: "bar" })).status, 404);

    const state = await call("/api/admin?op=state&venue=cafe", { headers: { cookie } });
    assert.ok((await state.json()).state.products.every((product) => product.id !== lasagne.id));
    const history = await (await call("/api/admin?op=audit&venue=restaurant", { headers: { cookie } })).json();
    assert.equal(history.entries[0].actor, "owner");
  } finally {
    await close();
  }
});

test("photo uploads are validated, stored by key and old unused objects removed", async () => {
  const { call, close, pg, storage } = await setup({ withStorage: true });
  try {
    const cookie = await session(call);
    const product = (await pg.query("select id from menu_items where venue = 'cafe' order by id limit 1")).rows[0];
    const other = (await pg.query("select id from menu_items where venue = 'restaurant' order by id limit 1")).rows[0];
    const upload = (query, body, type = "image/png") => call(`/api/admin?op=image.upload&${query}`, {
      method: "POST", headers: { ...same, cookie, "x-chichkhan-admin": "1", "content-type": type }, body,
    });

    const first = await upload(`venue=cafe&target=product&id=${product.id}`, png);
    assert.equal(first.status, 200);
    const firstKey = (await pg.query("select image_key from menu_items where id = $1", [product.id])).rows[0].image_key;
    assert.match(firstKey, new RegExp(`^products/cafe/${product.id}-[a-f0-9]{10}\\.png$`));
    assert.deepEqual([...storage.objects.keys()], [firstKey]);
    const body = await first.json();
    assert.equal(body.state.products.find((p) => p.id === product.id).imageUrl, `https://images.example.com/${firstKey}`);

    // Replacing removes the old object, because nothing else uses it.
    assert.equal((await upload(`venue=cafe&target=product&id=${product.id}`, png)).status, 200);
    assert.equal(storage.objects.size, 1);
    assert.ok(!storage.objects.has(firstKey));

    // A duplicate shares the photo, so removing it from one keeps the object.
    const copy = await (await post(call, cookie, "product.duplicate", { venue: "cafe", id: product.id })).json();
    await post(call, cookie, "image.remove", { venue: "cafe", target: "product", id: product.id });
    assert.equal(storage.objects.size, 1);
    await post(call, cookie, "image.remove", { venue: "cafe", target: "product", id: copy.id });
    assert.equal(storage.objects.size, 0);

    assert.equal((await upload(`venue=cafe&target=product&id=${other.id}`, png)).status, 404, "the other venue's product");
    assert.equal((await upload(`venue=cafe&target=venue&slot=banner`, png)).status, 400);
    assert.equal((await upload(`venue=cafe&target=product&id=${product.id}`, new TextEncoder().encode("<svg onload=alert(1)>"))).status, 415);
    assert.equal((await upload(`venue=cafe&target=product&id=${product.id}`, png, "image/svg+xml")).status, 415);
    assert.equal((await upload(`venue=cafe&target=product&id=${product.id}`, new Uint8Array(4 * 1024 * 1024 + 1))).status, 413);
    assert.equal(storage.objects.size, 0, "nothing stored for rejected uploads");

    const hero = await upload("venue=restaurant&target=venue&slot=hero", png);
    assert.equal(hero.status, 200);
    assert.match((await pg.query("select hero_image_key from venues where slug = 'restaurant'")).rows[0].hero_image_key, /^venues\/restaurant\/hero-[a-f0-9]{10}\.png$/);
  } finally {
    await close();
  }
});

test("uploads say they are not configured when storage is missing, and the rest still works", async () => {
  const { call, close } = await setup();
  try {
    const cookie = await session(call);
    const response = await call("/api/admin?op=image.upload&venue=cafe&target=venue&slot=logo", {
      method: "POST", headers: { ...same, cookie, "x-chichkhan-admin": "1", "content-type": "image/png" }, body: png,
    });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error.message, /^L’envoi d’images n’est pas configuré en local\./);
    assert.equal((await post(call, cookie, "group.create", { venue: "cafe", name: "Saison" })).status, 200);
  } finally {
    await close();
  }
});

test("without a database the admin shows no menu data", async () => {
  const { call, close } = await setup({ overrides: { DATABASE_URL: "" } });
  const original = console.error;
  console.error = () => {};
  try {
    const cookie = await session(call);
    const dashboard = await call("/api/admin?page=dashboard", { headers: { cookie } });
    assert.equal(dashboard.status, 503);
    const html = await dashboard.text();
    assert.match(html, /La base de données des menus est indisponible/);
    assert.ok(!/Chichkhan Café|SO Restaurant|Gérer le menu/.test(html));
    assert.equal((await call("/api/admin?page=cafe", { headers: { cookie } })).status, 503);
    const api = await post(call, cookie, "group.create", { venue: "cafe", name: "X" });
    assert.equal(api.status, 503);
    assert.match((await api.json()).error.message, /Aucune modification n’a été effectuée/);
  } finally {
    console.error = original;
    await close();
  }
});

test("the public menus never link to or mention the admin", () => {
  for (const venue of ["cafe", "restaurant"]) {
    const html = renderMenuPage(catalogue(venue));
    assert.ok(!/admin/i.test(html), venue);
  }
});
