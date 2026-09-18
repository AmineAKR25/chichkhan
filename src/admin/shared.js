// Shared by the admin server (authoritative validation) and the admin browser
// code (inline messages and previews), like src/search.js for the menu.
// Prices are integer millimes: 12500 is 12.500 DT.

export const ADMIN_VENUES = ["cafe", "restaurant"];
export const VENUE_LABELS = { cafe: "Café", restaurant: "Restaurant" };

export const LIMITS = { name: 120, description: 800, note: 300, slug: 60, groupName: 60, alt: 200, venueTitle: 60, subtitle: 60, eyebrow: 80, venueName: 120 };

// Which part of the main photo the page header shows (object-position, %).
export const PHOTO_POSITIONS = [
  { value: 0, label: "Haut" },
  { value: 50, label: "Milieu" },
  { value: 100, label: "Bas" },
];
export const MAX_PRICE_MILLIMES = 9999999; // 9999.999 DT

// Photos: the browser resizes large photos before upload; the server accepts
// at most MAX_UPLOAD_BYTES (Vercel functions take request bodies up to 4.5 MB).
export const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

// "12.500", "12,5", "12" and "12.500 DT" are 12500 millimes. Anything else,
// including negative numbers, thousands separators and more than three
// decimals, is rejected with a message the administrator can act on.
export function parsePrice(input) {
  const text = String(input ?? "").trim().replace(/\s*(dt|tnd)\.?$/i, "").trim();
  if (!text) return { error: "Saisissez un prix, par exemple 12.500." };
  if (/^[-−]/.test(text)) return { error: "Le prix ne peut pas être négatif." };
  const match = /^(\d{1,4})(?:[.,](\d{1,3}))?$/.exec(text);
  if (!match) {
    if (/^\d+[.,]\d{4,}$/.test(text)) return { error: "Utilisez au plus trois décimales (millimes), par exemple 12.500." };
    if (/^\d{5,}/.test(text)) return { error: "Le prix doit être inférieur à 10 000 DT." };
    return { error: "Saisissez le prix en dinars, par exemple 12.500 ou 8." };
  }
  const millimes = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  return { millimes };
}

export function formatPrice(millimes) {
  const value = Math.max(0, Math.trunc(Number(millimes) || 0));
  return `${Math.floor(value / 1000)}.${String(value % 1000).padStart(3, "0")} DT`;
}
// The value shown in a price field: "12.500".
export const priceInputValue = (millimes) => formatPrice(millimes).replace(" DT", "");

// Category slugs become the URL fragment on the public menu (/cafe#glaces).
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/['‘’ʼ´`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
}

// Single-line text: control characters removed, runs of spaces collapsed.
export function cleanLine(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}
// Descriptions and notes render as one paragraph, so line breaks become spaces.
export const cleanText = cleanLine;

function requireText(errors, field, value, label, max) {
  if (!value) errors[field] = `Saisissez ${label}.`;
  else if (value.length > max) errors[field] = `Limitez ${label} à ${max} caractères (actuellement ${value.length}).`;
}
function optionalText(errors, field, value, label, max) {
  if (value.length > max) errors[field] = `Limitez ${label} à ${max} caractères (actuellement ${value.length}).`;
}
function optionalId(errors, field, value, message) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) {
    errors[field] = message;
    return null;
  }
  return id;
}
function flag(errors, field, value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") errors[field] = "Choisissez oui ou non.";
  return value === true;
}

export function validateProduct(input = {}) {
  const errors = {};
  const name = cleanLine(input.name);
  requireText(errors, "name", name, "un nom de produit", LIMITS.name);
  const description = cleanText(input.description);
  optionalText(errors, "description", description, "la description", LIMITS.description);
  const price = parsePrice(input.price);
  if (price.error) errors.price = price.error;
  else if (price.millimes > MAX_PRICE_MILLIMES) errors.price = "Le prix doit être inférieur à 10 000 DT.";
  const categoryId = optionalId(errors, "categoryId", input.categoryId, "Choisissez une catégorie.");
  if (categoryId === null && !errors.categoryId) errors.categoryId = "Choisissez une catégorie.";
  return {
    errors,
    data: {
      name,
      description,
      millimes: price.millimes ?? null,
      categoryId,
      isVisible: flag(errors, "isVisible", input.isVisible, true),
      isHouse: flag(errors, "isHouse", input.isHouse, false),
    },
  };
}

export function validateCategory(input = {}) {
  const errors = {};
  const name = cleanLine(input.name);
  requireText(errors, "name", name, "un nom de catégorie", LIMITS.name);
  const rawSlug = cleanLine(input.slug);
  const slug = rawSlug || slugify(name);
  if (!slug) errors.slug = "Saisissez une adresse web avec des lettres et des chiffres, par exemple boissons-fraiches.";
  else if (slug.length > LIMITS.slug) errors.slug = `Limitez l’adresse web à ${LIMITS.slug} caractères.`;
  else if (!SLUG_PATTERN.test(slug)) errors.slug = "Utilisez seulement des lettres minuscules (a–z), des chiffres et un seul trait d’union entre les mots, par exemple boissons-fraiches.";
  const note = cleanText(input.note);
  optionalText(errors, "note", note, "la note du menu", LIMITS.note);
  const groupId = optionalId(errors, "groupId", input.groupId, "Choisissez un groupe ou « Sans groupe ».");
  return { errors, data: { name, slug, note, groupId, isVisible: flag(errors, "isVisible", input.isVisible, true) } };
}

export function validateGroup(input = {}) {
  const errors = {};
  const name = cleanLine(input.name);
  requireText(errors, "name", name, "un nom de groupe", LIMITS.groupName);
  return { errors, data: { name } };
}

// The page header. Only the fields sent are checked and saved: the "Change
// name and text" panel sends the texts, the photo window the photo position.
export function validateVenueDetails(input = {}) {
  const errors = {};
  const data = {};
  const sent = (field) => Object.hasOwn(input, field);
  if (sent("title")) {
    data.title = cleanLine(input.title);
    requireText(errors, "title", data.title, "le nom affiché sur la page", LIMITS.venueTitle);
  }
  if (sent("subtitle")) {
    data.subtitle = cleanLine(input.subtitle);
    optionalText(errors, "subtitle", data.subtitle, "la deuxième ligne", LIMITS.subtitle);
  }
  if (sent("eyebrow")) {
    data.eyebrow = cleanLine(input.eyebrow);
    optionalText(errors, "eyebrow", data.eyebrow, "la petite ligne", LIMITS.eyebrow);
  }
  if (sent("name")) {
    data.name = cleanLine(input.name);
    requireText(errors, "name", data.name, "le nom complet", LIMITS.venueName);
  }
  if (sent("heroImageAlt")) {
    data.heroImageAlt = cleanLine(input.heroImageAlt);
    optionalText(errors, "heroImageAlt", data.heroImageAlt, "la description de la photo", LIMITS.alt);
  }
  if (sent("heroFocusY")) {
    const focus = Number(input.heroFocusY);
    if (input.heroFocusY === null || input.heroFocusY === "" || !Number.isInteger(focus) || focus < 0 || focus > 100) errors.heroFocusY = "Choisissez Haut, Milieu ou Bas.";
    else data.heroFocusY = focus;
  }
  return { errors, data };
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
