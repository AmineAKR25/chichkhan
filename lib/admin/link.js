import { webcrypto as crypto } from "node:crypto";

// The owner link: the only way to reach the console without a session.
//
// A link carries an opaque token — AES-GCM over {expiresAt, nonce} under a key
// derived from ADMIN_LINK_SECRET. Nothing is readable from the URL, not even
// the expiry date, and a token cannot be produced without the secret.
//
// The link alone never grants access. Opening it only unlocks the password
// screen; link plus password creates the session. Generate one with
// `npm run admin:link -- https://example.com [jours|toujours]`.

const IV_BYTES = 12;
const DEFAULT_LINK_DAYS = 30;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const fromBase64url = (value) => new Uint8Array(Buffer.from(value, "base64url"));

// The secret is hashed to a 256-bit key, so any secret length works.
async function linkKey(secret, usages) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

export async function createAccessLinkToken(secret, expiresAt = Date.now() + DEFAULT_LINK_DAYS * 86400_000) {
  if (!secret) throw new Error("ADMIN_LINK_SECRET n’est pas défini.");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const payload = encoder.encode(JSON.stringify({
    expiresAt: expiresAt === null ? null : Math.floor(expiresAt),
    nonce: base64url(crypto.getRandomValues(new Uint8Array(16))),
  }));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await linkKey(secret, ["encrypt"]), payload));
  const packed = new Uint8Array(iv.length + sealed.length);
  packed.set(iv);
  packed.set(sealed, iv.length);
  return base64url(packed);
}

// Any tampering fails the AES-GCM tag, so an invalid token is simply unknown.
export async function accessTokenIsValid(secret, token) {
  if (!secret || typeof token !== "string" || !token || token.length > 512) return false;
  try {
    const packed = fromBase64url(token);
    if (packed.length <= IV_BYTES) return false;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, IV_BYTES) },
      await linkKey(secret, ["decrypt"]),
      packed.slice(IV_BYTES),
    );
    const payload = JSON.parse(decoder.decode(plain));
    if (!payload?.nonce) return false;
    return payload.expiresAt === null || (Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now());
  } catch {
    return false;
  }
}
