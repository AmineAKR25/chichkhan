import { IMAGE_TYPES, MAX_UPLOAD_BYTES } from "../../src/admin/shared.js";
import { openDatabase } from "../database.js";
import { imageUrl } from "../images.js";
import {
  LoginThrottle, adminConfig, clearOwnerLinkCookie, clearSessionCookie, clientAddress, createSessionToken,
  isSameOrigin, ownerLinkCookie, readOwnerLink, readSession, safeEqual, sessionCookie, verifyPassword,
} from "./auth.js";
import { accessTokenIsValid } from "./link.js";
import { AdminError } from "./errors.js";
import { renderDashboard, renderEditor, renderLogin, renderMessagePage, renderSetup } from "./pages.js";
import { createStorage, imageKeyFor, sniffImageType, storageConfig } from "./storage.js";
import {
  assertVenue, isImageKeyReferenced, loadAudit, loadOverview, loadVenueState, resolveImageTarget, runOperation, setImageKey,
} from "./store.js";

// Everything under /admin, /owner-access and /api/admin. Pages arrive as
// ?page=… through the rewrites in vercel.json, API calls as /api/admin?op=….
//
// The console has no public door. Without a valid session every /admin and
// /api/admin route answers 404, so the path gives nothing away to anyone who
// guesses it. The single unauthenticated entry point is the owner link,
// /owner-access/<token>, and that link only unlocks the password screen:
// link plus password creates the session. Every state-changing request must
// also come from this site's own admin pages.

const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const defaultThrottle = new LoginThrottle();
const MAX_JSON_BYTES = 64 * 1024;

function originOf(value) {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

function securityHeaders(env) {
  const images = originOf(env.R2_PUBLIC_BASE_URL);
  return {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Content-Security-Policy": [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${images ? ` ${images}` : ""}`,
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
  };
}

function respond(status, body, env, type, extra = {}) {
  const headers = new Headers(securityHeaders(env));
  headers.set("Content-Type", type);
  for (const [name, value] of Object.entries(extra)) {
    if (name === "Set-Cookie") for (const cookie of [value].flat()) headers.append(name, cookie);
    else headers.set(name, value);
  }
  return new Response(body, { status, headers });
}
const html = (status, body, env, extra) => respond(status, body, env, HTML, extra);
const json = (status, data, env) => respond(status, JSON.stringify(data), env, JSON_TYPE);
const redirect = (location, env, extra = {}) => respond(303, null, env, HTML, { Location: location, ...extra });
const apiError = (status, message, env, extra = {}) => json(status, { ok: false, error: { message, ...extra } }, env);

// The console's answer to anyone without a session: the same empty 404 a path
// that was never routed would give. Nothing here names the admin.
const notFound = (env, extra = {}) => respond(404, null, env, HTML, extra);
// The browser console still needs to tell "signed out" from "broken", so the
// body carries the reason while the status stays 404.
const notFoundApi = (env) =>
  respond(404, JSON.stringify({ ok: false, error: { message: "Votre session a expiré. Rouvrez votre lien privé pour continuer.", code: "signed-out" } }), env, JSON_TYPE);

// Only admin pages are allowed as the place to return to after sign-in.
const NEXT_PATTERN = /^\/admin(?:\/(?:cafe|restaurant))?(?:\?[A-Za-z0-9=&%._+-]*)?$/;
const safeNext = (value) => (typeof value === "string" && NEXT_PATTERN.test(value) ? value : "");

function databaseUrl(env) {
  return env.ADMIN_DATABASE_URL || env.DATABASE_URL || "";
}

// Maps database failures to messages the administrator can act on.
function classify(error) {
  if (error instanceof AdminError) return error;
  const code = error?.code;
  if (code === "23505") return new AdminError(409, "Ce nom ou cette adresse web est déjà utilisé(e) dans ce menu.");
  if (code === "23503") return new AdminError(409, "Cet élément a changé ou n’existe plus. Rechargez la page puis réessayez.");
  if (code === "23514" || code === "22P02" || code === "22003") return new AdminError(400, "L’une des valeurs n’est pas valide.");
  if (code === "no-database" || ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "57P01", "57P03", "53300", "08006", "08001"].includes(code) ||
    /timeout|timed out|terminated|connect/i.test(error?.message ?? "")) {
    return new AdminError(503, "Impossible de joindre la base de données des menus. Aucune modification n’a été effectuée. Réessayez dans un instant.", { code: "database-unavailable" });
  }
  return null;
}

function openDb(deps) {
  const url = databaseUrl(deps.env);
  if (!url) throw Object.assign(new Error("DATABASE_URL n’est pas défini"), { code: "no-database" });
  return deps.openDb(url);
}

// Image URLs are added on the server, so the browser never needs the
// storage configuration.
function decorate(state, env, uploads) {
  const url = (key) => imageUrl(env.R2_PUBLIC_BASE_URL, key);
  return {
    ...state,
    venue: { ...state.venue, heroImageUrl: url(state.venue.heroImageKey), logoImageUrl: url(state.venue.logoImageKey) },
    categories: state.categories.map((category) => ({ ...category, imageUrl: url(category.imageKey) })),
    products: state.products.map((product) => ({ ...product, imageUrl: url(product.imageKey) })),
    uploads,
  };
}

// ---------------------------------------------------------------------------
// Storage status

const probes = new Map();
function storageFor(deps) {
  if (deps.storage !== undefined) return deps.storage;
  const config = storageConfig(deps.env);
  return config.configured ? createStorage(config) : null;
}
export async function uploadStatus(env, storage) {
  const config = storageConfig(env);
  const hosted = Boolean(env.VERCEL);
  if (!config.configured || !storage) {
    return {
      enabled: false,
      message: hosted ? "L’envoi d’images n’est pas configuré." : "L’envoi d’images n’est pas configuré en local.",
      detail: hosted
        ? "Les photos ne peuvent pas être ajoutées tant que Cloudflare R2 n’est pas connecté (voir le README). Le reste fonctionne."
        : "Le reste fonctionne. Pour essayer les envois, installez MinIO ou SeaweedFS, lancez npm run local:setup, puis npm run local:start.",
    };
  }
  if (config.local) {
    // "Configured but not running" is only checked for a local service.
    const cached = probes.get(config.endpoint);
    let reachable = cached && Date.now() - cached.at < 15_000 ? cached.ok : null;
    if (reachable === null) {
      reachable = await storage.probe();
      probes.set(config.endpoint, { ok: reachable, at: Date.now() });
    }
    if (!reachable) {
      return { enabled: false, message: "L’envoi d’images n’est pas configuré en local.", detail: "Le service de stockage local n’est pas lancé. Démarrez-le avec npm run local:start. Le reste fonctionne." };
    }
  }
  return { enabled: true, maxBytes: MAX_UPLOAD_BYTES };
}

async function releaseKeys(db, storage, keys = []) {
  for (const key of keys) {
    try {
      if (storage && !(await isImageKeyReferenced(db, key))) await storage.deleteObject(key);
    } catch (error) {
      console.error(`[admin] could not remove ${key} from storage: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Request bodies

async function readBody(request, limit) {
  if (!request.body) return new Uint8Array(0);
  const declared = Number(request.headers.get("content-length"));
  if (declared > limit) throw new AdminError(413, "Cette requête est trop volumineuse.");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new AdminError(413, "Cette requête est trop volumineuse.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
}

async function readJson(request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new AdminError(415, "Format JSON attendu.");
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(await readBody(request, MAX_JSON_BYTES)).toString("utf8"));
  } catch (error) {
    if (error instanceof AdminError) throw error;
    throw new AdminError(400, "La requête est illisible.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new AdminError(400, "La requête est illisible.");
  return data;
}

async function readForm(request) {
  return new URLSearchParams(Buffer.from(await readBody(request, 8 * 1024)).toString("utf8"));
}

// ---------------------------------------------------------------------------
// Pages

// Step one: the owner opens their private link. A token that does not decrypt,
// or has expired, is indistinguishable from a path that does not exist. A good
// token only unlocks the password screen, and only for the next few minutes.
async function openOwnerLink(request, url, config, deps) {
  const token = url.searchParams.get("token") ?? "";
  if (!(await accessTokenIsValid(config.linkSecret, token))) return notFound(deps.env);
  return redirect("/owner-access/password", deps.env, {
    "Set-Cookie": ownerLinkCookie(request, token),
    // Keeps the token out of the Referer header of anything the next page loads.
    "Referrer-Policy": "no-referrer",
  });
}

// Step two: the password screen, reachable only while the opened link is still
// held. Without it there is nothing here either.
async function passwordPage(request, url, config, deps) {
  if (readSession(request, config, deps.now())) return redirect(safeNext(url.searchParams.get("next")) || "/admin", deps.env);
  if (!(await accessTokenIsValid(config.linkSecret, readOwnerLink(request)))) return notFound(deps.env);
  const next = safeNext(url.searchParams.get("next"));
  return html(200, renderLogin({ next }), deps.env, { "Referrer-Policy": "no-referrer" });
}

async function login(request, url, config, deps) {
  const { env } = deps;
  const form = await readForm(request).catch(() => new URLSearchParams());
  const next = safeNext(form.get("next") ?? url.searchParams.get("next"));
  const username = String(form.get("username") ?? "").slice(0, 200);
  // The password is only ever checked for someone holding a live owner link.
  if (!(await accessTokenIsValid(config.linkSecret, readOwnerLink(request)))) return notFound(env);
  if (!isSameOrigin(request)) {
    return html(403, renderLogin({ username, next, error: "Ce formulaire de connexion a expiré. Rechargez la page puis réessayez." }), env);
  }
  const address = clientAddress(request);
  const wait = deps.throttle.retryAfter(address, deps.now());
  if (wait) {
    const minutes = Math.max(1, Math.ceil(wait / 60));
    return html(429, renderLogin({ username, next, error: `Trop de tentatives infructueuses. Attendez ${minutes} minute${minutes === 1 ? "" : "s"}, puis réessayez.` }), env, { "Retry-After": String(wait) });
  }
  // The password is always checked, so a wrong username takes as long as a wrong password.
  const passwordOk = await verifyPassword(String(form.get("password") ?? ""), config.passwordHash);
  const usernameOk = safeEqual(username.trim(), config.username);
  if (!passwordOk || !usernameOk) {
    deps.throttle.fail(address, deps.now());
    return html(401, renderLogin({ username, next, error: "L’identifiant ou le mot de passe est incorrect. Vérifiez-les puis réessayez." }), env);
  }
  deps.throttle.succeed(address);
  return redirect(next || "/admin", env, {
    "Set-Cookie": [sessionCookie(request, createSessionToken(config, deps.now())), clearOwnerLinkCookie(request)],
  });
}

// Signing out ends the session and the link cookie with it. There is no
// sign-in page to return to: coming back means reopening the private link.
function logout(request, env) {
  if (!isSameOrigin(request)) return notFound(env);
  return html(200, renderMessagePage({
    title: "Déconnexion",
    heading: "Vous êtes déconnecté·e.",
    message: "Pour revenir, rouvrez votre lien privé. Vous pouvez fermer cet onglet.",
    status: "info",
  }), env, { "Set-Cookie": [clearSessionCookie(request), clearOwnerLinkCookie(request)] });
}

function requireSessionForPage(request, url, config, deps) {
  const session = readSession(request, config, deps.now());
  return session ? { session } : { response: notFound(deps.env) };
}

async function dashboard(request, url, config, deps) {
  const { session, response } = requireSessionForPage(request, url, config, deps);
  if (response) return response;
  const imageUrlFor = (key) => imageUrl(deps.env.R2_PUBLIC_BASE_URL, key);
  try {
    const overview = await loadOverview(openDb(deps));
    return html(200, renderDashboard({ session, overview, imageUrlFor }), deps.env);
  } catch (error) {
    const known = classify(error);
    if (known?.status !== 503) throw error;
    console.error(`[admin] dashboard: ${error.message}`);
    const reason = error.code === "no-database" ? "DATABASE_URL n’est pas défini." : "La base de données est inaccessible.";
    return html(503, renderDashboard({ session, overview: null, imageUrlFor, databaseError: reason }), deps.env);
  }
}

async function editor(request, url, venue, config, deps) {
  const { session, response } = requireSessionForPage(request, url, config, deps);
  if (response) return response;
  try {
    const db = openDb(deps);
    const storage = storageFor(deps);
    const state = decorate(await loadVenueState(db, venue), deps.env, await uploadStatus(deps.env, storage));
    return html(200, renderEditor({ session, venue, state }), deps.env);
  } catch (error) {
    const known = classify(error);
    if (!known) throw error;
    console.error(`[admin] editor ${venue}: ${error.message}`);
    return html(known.status, renderMessagePage({
      title: "Menu indisponible",
      heading: known.status === 503 ? "La base de données des menus est indisponible." : "Ce menu ne peut pas être ouvert.",
      message: known.status === 503 ? "Aucune donnée de menu ne peut être affichée ou modifiée tant que la connexion ne fonctionne pas. Réessayez dans un instant." : known.message,
      session,
    }), deps.env);
  }
}

// ---------------------------------------------------------------------------
// API

async function upload(request, url, session, deps) {
  const { env } = deps;
  const venue = assertVenue(url.searchParams.get("venue"));
  const spec = { target: url.searchParams.get("target"), id: url.searchParams.get("id"), slot: url.searchParams.get("slot") };
  const storage = storageFor(deps);
  const status = await uploadStatus(env, storage);
  if (!status.enabled) throw new AdminError(503, `${status.message} ${status.detail}`);
  const declared = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[declared]) throw new AdminError(415, "Choisissez une photo JPEG, PNG ou WebP.");
  let bytes;
  try {
    bytes = await readBody(request, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error.status === 413) throw new AdminError(413, "Cette photo est trop volumineuse. Choisissez-en une de moins de 4 Mo.");
    throw error;
  }
  if (!bytes.length) throw new AdminError(400, "Le fichier est vide. Choisissez une autre photo.");
  const type = sniffImageType(bytes);
  if (!type) throw new AdminError(415, "Ce fichier n’est pas une photo JPEG, PNG ou WebP. Choisissez un autre fichier.");
  const db = openDb(deps);
  const target = await resolveImageTarget(db, venue, spec);
  const key = imageKeyFor({ venue, target: target.target, slot: target.slot, id: target.id, slug: target.slug }, type);
  try {
    await storage.putObject(key, bytes, type);
  } catch (error) {
    console.error(`[admin] upload to storage failed: ${error.message}`);
    throw new AdminError(502, "Impossible d’enregistrer la photo. Aucune modification n’a été effectuée. Réessayez dans un instant.");
  }
  let result;
  try {
    result = await setImageKey(db, { venue, actor: session.username, ...spec, key });
  } catch (error) {
    await storage.deleteObject(key).catch(() => {});
    throw error;
  }
  await releaseKeys(db, storage, result.releasedKeys);
  return json(200, { ok: true, message: result.message, state: decorate(result.state, env, status) }, env);
}

async function api(request, url, op, config, deps) {
  const { env } = deps;
  const session = readSession(request, config, deps.now());
  if (!session) return notFoundApi(env);
  if (request.method === "POST" && (request.headers.get("x-chichkhan-admin") !== "1" || !isSameOrigin(request))) {
    return apiError(403, "Cette requête a été bloquée car elle ne provient pas de la page d’administration. Rechargez la page puis réessayez.", env);
  }
  try {
    if (request.method !== "POST") {
      const db = openDb(deps);
      if (op === "state") {
        const venue = assertVenue(url.searchParams.get("venue"));
        const state = await loadVenueState(db, venue);
        return json(200, { ok: true, state: decorate(state, env, await uploadStatus(env, storageFor(deps))) }, env);
      }
      if (op === "audit") {
        const venue = assertVenue(url.searchParams.get("venue"));
        return json(200, { ok: true, ...(await loadAudit(db, venue, { before: url.searchParams.get("before") })) }, env);
      }
      if (op === "overview") return json(200, { ok: true, overview: await loadOverview(db) }, env);
      return apiError(404, "Action inconnue.", env);
    }
    if (op === "image.upload") return await upload(request, url, session, deps);
    const input = await readJson(request);
    const db = openDb(deps);
    const result = await runOperation(db, op, { venue: input.venue, actor: session.username, input });
    const storage = storageFor(deps);
    await releaseKeys(db, storage, result.releasedKeys);
    return json(200, {
      ok: true,
      message: result.message,
      warning: result.warning,
      undo: result.undo,
      id: result.id,
      order: result.order,
      state: decorate(result.state, env, await uploadStatus(env, storage)),
    }, env);
  } catch (error) {
    const known = classify(error);
    if (!known) throw error;
    if (known.status >= 500) console.error(`[admin] ${op}: ${error.message}`);
    return apiError(known.status, known.message, env, { fields: known.fields, code: known.code });
  }
}

export async function handleAdminRequest(request, options = {}) {
  const env = options.env ?? process.env;
  const deps = {
    env,
    now: options.now ?? Date.now,
    openDb: options.openDb ?? openDatabase,
    storage: options.storage,
    throttle: options.throttle ?? defaultThrottle,
  };
  const url = new URL(request.url);
  const op = url.searchParams.get("op");
  const page = url.searchParams.get("page");
  try {
    if (!["GET", "HEAD", "POST"].includes(request.method)) {
      return respond(405, "Method not allowed", env, "text/plain; charset=utf-8", { Allow: "GET, HEAD, POST" });
    }
    const config = adminConfig(env);
    // Half-configured in production is treated as not existing at all, so a
    // missing variable can never turn into an open door or a hint that the
    // console is there. Locally the setup screen still explains what is left.
    if (!config.ready) {
      if (env.VERCEL) return op ? notFoundApi(env) : notFound(env);
      return op
        ? apiError(503, "L’administration n’est pas encore configurée.", env, { code: "setup-needed" })
        : html(503, renderSetup(config), env);
    }
    if (op) return await api(request, url, op, config, deps);
    const isPost = request.method === "POST";
    // The owner link and the password screen behind it: the only way in.
    if (page === "access") return isPost ? notFound(env) : await openOwnerLink(request, url, config, deps);
    if (page === "access-password") return isPost ? await login(request, url, config, deps) : await passwordPage(request, url, config, deps);
    if (page === "logout") return isPost ? logout(request, env) : notFound(env);
    if (isPost) return notFound(env);
    if (page === "dashboard") return await dashboard(request, url, config, deps);
    if (page === "cafe" || page === "restaurant") return await editor(request, url, page, config, deps);
    return notFound(env);
  } catch (error) {
    console.error(`[admin] ${error?.stack ?? error}`);
    if (op) return apiError(500, "Une erreur est survenue sur le serveur. Aucune modification n’a été effectuée. Réessayez dans un instant.", env);
    // Only someone already signed in should learn that anything is here.
    if (!readSession(request, adminConfig(env), deps.now())) return notFound(env);
    return html(500, renderMessagePage({ title: "Erreur", heading: "Une erreur est survenue.", message: "La page ne peut pas être affichée. Réessayez dans un instant." }), env);
  }
}
