// Prints a private owner link for the admin console.
//
//   npm run admin:link -- https://chichkhan.example.com            (no expiry)
//   npm run admin:link -- https://chichkhan.example.com 30         (30 days)
//
// Reads ADMIN_LINK_SECRET from .env.local (or the environment). The link is the
// only unauthenticated way in, and it only opens the password screen, so it is
// safe to send over a normal channel — but treat it as a key: anyone holding it
// still has to know the password, and anyone holding both is the owner.
//
// Changing ADMIN_LINK_SECRET invalidates every link ever issued.
import { createAccessLinkToken } from "../lib/admin/link.js";

const [baseUrl, lifetime = process.env.ADMIN_LINK_DAYS ?? "toujours"] = process.argv.slice(2);
const secret = process.env.ADMIN_LINK_SECRET?.trim();

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!baseUrl) fail("Indiquez l’adresse du site : npm run admin:link -- https://exemple.com [jours|toujours]");
if (!secret) fail("ADMIN_LINK_SECRET n’est pas défini. Ajoutez-le à .env.local, ou générez-en un avec npm run admin:password.");
if (secret.length < 32) fail("ADMIN_LINK_SECRET doit contenir au moins 32 caractères.");

let origin;
try {
  origin = new URL(baseUrl).origin;
} catch {
  fail(`“${baseUrl}” n’est pas une adresse valide.`);
}

const forever = ["toujours", "forever", "0"].includes(String(lifetime).trim().toLowerCase());
const days = Number(lifetime);
if (!forever && (!Number.isFinite(days) || days <= 0)) fail("La durée doit être un nombre de jours positif, ou « toujours ».");

const token = await createAccessLinkToken(secret, forever ? null : Date.now() + days * 86400_000);
const expiry = forever ? "sans expiration" : `valable ${days} jour${days === 1 ? "" : "s"}`;

console.log(`\n  ${new URL(`/owner-access/${token}`, origin)}\n`);
console.log(`  Lien privé ${expiry}.`);
console.log("  Il ouvre l’écran du mot de passe : le lien seul ne donne aucun accès.");
console.log("  Gardez-le comme une clé et ne le publiez nulle part.\n");
