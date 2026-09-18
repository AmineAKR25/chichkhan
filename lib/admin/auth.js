import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Administrator credentials come from the environment only:
//   ADMIN_USERNAME         the sign-in name, recorded in the admin history
//   ADMIN_PASSWORD_HASH    scrypt hash from `npm run admin:password`
//   ADMIN_SESSION_SECRET   at least 32 random characters, signs session cookies
//   ADMIN_LINK_SECRET      at least 32 random characters, encrypts the owner link
// There is no default password and no bypass: when any of these is missing
// the console answers 404 everywhere, as though it did not exist.

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const HASH_PREFIX = "scrypt";

const runScrypt = (password, salt, length, { N, r, p }) => new Promise((resolve, reject) => {
  scrypt(password, salt, length, { N, r, p, maxmem: 256 * N * r }, (error, key) => (error ? reject(error) : resolve(key)));
});

// Format: scrypt:N:r:p:salt:hash (base64url). Colons rather than "$" so the
// value survives .env files and dashboards that expand variables.
export async function hashPassword(password, { N = 32768, r = 8, p = 1 } = {}) {
  if (typeof password !== "string" || password.length < 12) throw new Error("Utilisez un mot de passe d’au moins 12 caractères.");
  const salt = randomBytes(16);
  const hash = await runScrypt(password.normalize("NFKC"), salt, 32, { N, r, p });
  return [HASH_PREFIX, N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(":");
}

export function parsePasswordHash(stored) {
  const parts = String(stored ?? "").trim().split(":");
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  const powerOfTwo = Number.isInteger(N) && N >= 16384 && N <= 1048576 && (N & (N - 1)) === 0;
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null;
  if (salt.length < 16 || hash.length < 32 || hash.length > 64) return null;
  return { N, r, p, salt, hash };
}

export async function verifyPassword(password, stored) {
  const parsed = parsePasswordHash(stored);
  if (!parsed || typeof password !== "string" || password.length > 1024) return false;
  const actual = await runScrypt(password.normalize("NFKC"), parsed.salt, parsed.hash.length, parsed);
  return timingSafeEqual(actual, parsed.hash);
}

// Compares two strings without revealing where they differ.
export function safeEqual(a, b) {
  const key = randomBytes(32);
  const digest = (value) => createHmac("sha256", key).update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function adminConfig(env = process.env) {
  const missing = [];
  const problems = [];
  const username = String(env.ADMIN_USERNAME ?? "").trim();
  const passwordHash = String(env.ADMIN_PASSWORD_HASH ?? "").trim();
  const secret = String(env.ADMIN_SESSION_SECRET ?? "");
  const linkSecret = String(env.ADMIN_LINK_SECRET ?? "");
  if (!username) missing.push("ADMIN_USERNAME");
  if (!passwordHash) missing.push("ADMIN_PASSWORD_HASH");
  else if (!parsePasswordHash(passwordHash)) problems.push("ADMIN_PASSWORD_HASH n’est pas un hachage de mot de passe valide. Générez-en un avec npm run admin:password.");
  if (!secret) missing.push("ADMIN_SESSION_SECRET");
  else if (secret.length < MIN_SECRET_LENGTH) problems.push(`ADMIN_SESSION_SECRET doit contenir au moins ${MIN_SECRET_LENGTH} caractères.`);
  if (!linkSecret) missing.push("ADMIN_LINK_SECRET");
  else if (linkSecret.length < MIN_SECRET_LENGTH) problems.push(`ADMIN_LINK_SECRET doit contenir au moins ${MIN_SECRET_LENGTH} caractères.`);
  return { ready: !missing.length && !problems.length, missing, problems, username, passwordHash, secret, linkSecret };
}

// The signing key also covers the password hash and username, so changing
// either signs every existing session out.
function sessionKey(config) {
  return createHmac("sha256", config.secret)
    .update(`chichkhan-admin-session\u0000${config.username}\u0000${config.passwordHash}`)
    .digest();
}

export function createSessionToken(config, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = { u: config.username, iat: issuedAt, exp: issuedAt + SESSION_TTL_SECONDS, n: randomBytes(9).toString("base64url") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", sessionKey(config)).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function readSessionToken(config, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, signature] = parts;
  const expected = createHmac("sha256", sessionKey(config)).update(body).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const seconds = Math.floor(now / 1000);
  if (payload?.u !== config.username || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) return null;
  if (payload.exp <= seconds || payload.iat > seconds + 60) return null;
  return { username: payload.u, expiresAt: payload.exp };
}

// "__Host-" cookies must be Secure with Path=/ and no Domain, so they cannot
// be set or overridden by another subdomain. Plain http (local development
// only) uses an unprefixed name without Secure.
export const isSecureRequest = (request) =>
  new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
export const sessionCookieName = (secure) => (secure ? "__Host-chichkhan_admin" : "chichkhan_admin");

export function sessionCookie(request, token, maxAge = SESSION_TTL_SECONDS) {
  const secure = isSecureRequest(request);
  return `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export const clearSessionCookie = (request) => sessionCookie(request, "", 0);

// The owner-link cookie carries the opened link across the redirect to the
// password screen. It is scoped to /owner-access, so it never reaches the menu
// pages, and lasts minutes rather than hours. "__Host-" needs Path=/, so a
// path-scoped cookie uses the "__Secure-" prefix instead.
export const OWNER_LINK_TTL_SECONDS = 10 * 60;
export const ownerLinkCookieName = (secure) => (secure ? "__Secure-chichkhan_owner_link" : "chichkhan_owner_link");

export function ownerLinkCookie(request, token, maxAge = OWNER_LINK_TTL_SECONDS) {
  const secure = isSecureRequest(request);
  return `${ownerLinkCookieName(secure)}=${token}; Path=/owner-access; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export const clearOwnerLinkCookie = (request) => ownerLinkCookie(request, "", 0);

export function readOwnerLink(request) {
  const name = ownerLinkCookieName(isSecureRequest(request));
  return parseCookies(request.headers.get("cookie"))[name] ?? "";
}

export function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!(name in cookies)) cookies[name] = part.slice(index + 1).trim();
  }
  return cookies;
}

export function readSession(request, config, now = Date.now()) {
  const name = sessionCookieName(isSecureRequest(request));
  return readSessionToken(config, parseCookies(request.headers.get("cookie"))[name], now);
}

// Best-effort brute-force protection: after `limit` failed sign-ins from one
// address within the window, that address waits. Serverless instances do not
// share memory, so the slow scrypt hash remains the main defence.
export class LoginThrottle {
  constructor({ limit = 8, windowMs = 15 * 60 * 1000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }
  retryAfter(key, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || now - entry.first > this.windowMs) return 0;
    return entry.count >= this.limit ? Math.ceil((entry.first + this.windowMs - now) / 1000) : 0;
  }
  fail(key, now = Date.now()) {
    if (this.entries.size > 5000) {
      for (const [k, entry] of this.entries) if (now - entry.first > this.windowMs) this.entries.delete(k);
    }
    const entry = this.entries.get(key);
    if (!entry || now - entry.first > this.windowMs) this.entries.set(key, { count: 1, first: now });
    else entry.count += 1;
  }
  succeed(key) {
    this.entries.delete(key);
  }
}

export function clientAddress(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return request.headers.get("x-real-ip") || (forwarded ? forwarded.split(",")[0].trim() : "") || "local";
}

// State-changing requests must come from this site's own pages. Browsers
// send Origin (and Sec-Fetch-Site) with every POST; both must agree.
export function isSameOrigin(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
