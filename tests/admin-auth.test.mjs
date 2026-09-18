// Admin sign-in: password hashing, signed session cookies, same-origin checks
// and the sign-in throttle. No secrets from the environment are used.
import test from "node:test";
import assert from "node:assert/strict";
import {
  LoginThrottle, adminConfig, createSessionToken, hashPassword, isSameOrigin, parseCookies,
  readSession, readSessionToken, sessionCookie, clearSessionCookie, verifyPassword,
} from "../lib/admin/auth.js";

const password = "correct horse battery staple";
const hash = await hashPassword(password);
const config = adminConfig({ ADMIN_USERNAME: "owner", ADMIN_PASSWORD_HASH: hash, ADMIN_SESSION_SECRET: "s".repeat(40), ADMIN_LINK_SECRET: "l".repeat(40) });

test("passwords are stored as salted scrypt hashes and verified in constant time", async () => {
  assert.match(hash, /^scrypt:32768:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
  assert.ok(!hash.includes("$"), "safe in .env files that expand $");
  assert.notEqual(await hashPassword(password), hash, "every hash has its own salt");
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("correct horse battery stapl", hash), false);
  assert.equal(await verifyPassword(password, "plain-text-password"), false);
  assert.equal(await verifyPassword(password, "scrypt:1024:8:1:abc:def"), false);
  await assert.rejects(hashPassword("short"), /au moins 12/);
});

test("the admin is locked until every setting is present and valid", () => {
  assert.equal(config.ready, true);
  const empty = adminConfig({});
  assert.equal(empty.ready, false);
  assert.deepEqual(empty.missing, ["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET", "ADMIN_LINK_SECRET"]);
  const weak = adminConfig({ ADMIN_USERNAME: "owner", ADMIN_PASSWORD_HASH: "hunter2", ADMIN_SESSION_SECRET: "short", ADMIN_LINK_SECRET: "short" });
  assert.equal(weak.ready, false);
  assert.equal(weak.problems.length, 3);
  // A link secret on its own is not enough to open anything.
  assert.equal(adminConfig({ ADMIN_LINK_SECRET: "l".repeat(40) }).ready, false);
});

test("session tokens are signed, expire, and die when the password or secret changes", async () => {
  const now = Date.UTC(2026, 8, 18, 12);
  const token = createSessionToken(config, now);
  assert.deepEqual(readSessionToken(config, token, now + 1000), { username: "owner", expiresAt: now / 1000 + 12 * 3600 });
  assert.equal(readSessionToken(config, token, now + 12 * 3600 * 1000 + 1), null, "expired after 12 hours");
  const [body, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "owner", iat: now / 1000, exp: now / 1000 + 10 ** 9, n: "x" })).toString("base64url");
  assert.equal(readSessionToken(config, `${forged}.${signature}`, now), null, "payload cannot be changed");
  assert.equal(readSessionToken(config, `${body}.${signature.slice(0, -2)}AA`, now), null);
  assert.equal(readSessionToken(config, `${body}`, now), null);
  assert.equal(readSessionToken(config, "", now), null);
  assert.equal(readSessionToken({ ...config, secret: "t".repeat(40) }, token, now), null, "new secret");
  assert.equal(readSessionToken({ ...config, passwordHash: await hashPassword("another long password") }, token, now), null, "new password");
  assert.equal(readSessionToken({ ...config, username: "someone" }, token, now), null, "other username");
});

test("the session cookie is HttpOnly, SameSite=Strict and __Host- on https", () => {
  const secure = new Request("https://menu.example.com/admin/login");
  const cookie = sessionCookie(secure, "abc.def");
  assert.match(cookie, /^__Host-chichkhan_admin=abc\.def; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
  assert.match(clearSessionCookie(secure), /Max-Age=0/);
  const local = sessionCookie(new Request("http://localhost:4173/admin/login"), "abc.def");
  assert.match(local, /^chichkhan_admin=abc\.def; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/);
  // On https only the __Host- cookie counts, so a plain cookie set by a subdomain is ignored.
  const token = createSessionToken(config);
  const plainOnHttps = new Request("https://menu.example.com/admin", { headers: { cookie: `chichkhan_admin=${token}` } });
  assert.equal(readSession(plainOnHttps, config), null);
  const hostOnHttps = new Request("https://menu.example.com/admin", { headers: { cookie: `other=1; __Host-chichkhan_admin=${token}` } });
  assert.equal(readSession(hostOnHttps, config).username, "owner");
  assert.deepEqual(parseCookies("a=1; b=x=y; a=2"), { a: "1", b: "x=y" });
});

test("state-changing requests must come from the same origin", () => {
  const post = (headers) => new Request("https://menu.example.com/api/admin", { method: "POST", headers: { host: "menu.example.com", ...headers } });
  assert.equal(isSameOrigin(post({ origin: "https://menu.example.com", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOrigin(post({ origin: "https://menu.example.com" })), true);
  assert.equal(isSameOrigin(post({ origin: "https://evil.example" })), false);
  assert.equal(isSameOrigin(post({ origin: "https://menu.example.com", "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOrigin(post({})), false, "no Origin and no Sec-Fetch-Site");
  assert.equal(isSameOrigin(post({ origin: "null" })), false);
});

test("repeated failed sign-ins from one address are slowed down", () => {
  const throttle = new LoginThrottle({ limit: 3, windowMs: 60_000 });
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(throttle.retryAfter("1.2.3.4", t), 0);
    throttle.fail("1.2.3.4", t);
  }
  assert.ok(throttle.retryAfter("1.2.3.4", t + 1000) > 0);
  assert.equal(throttle.retryAfter("5.6.7.8", t + 1000), 0, "other addresses are not affected");
  assert.equal(throttle.retryAfter("1.2.3.4", t + 61_000), 0, "the wait ends");
  throttle.fail("5.6.7.8", t);
  throttle.succeed("5.6.7.8");
  assert.equal(throttle.entries.has("5.6.7.8"), false);
});
