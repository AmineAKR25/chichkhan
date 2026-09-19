// The admin's browser module, booted against a throwaway DOM.
//
// src/admin/admin.js never runs under `npm test`, so a name left behind by a
// refactor — a helper deleted while one call site survived — used to reach the
// browser and blank the editor, with nothing but a syntax check in the way.
// This boots the real module with a realistic payload and fails on any error
// it throws, which is exactly how such a leftover shows up.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repo = new URL("../", import.meta.url);

// A DOM stub: every node answers the handful of calls the editor makes while
// it draws, and remembers the HTML written into it.
function stubDom(payload) {
  const nodes = new Map();
  const make = (id = "") => ({
    id, dataset: {}, style: {}, value: "", hidden: false, disabled: false, textContent: "",
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    set innerHTML(html) { this._html = html; }, get innerHTML() { return this._html ?? ""; },
    addEventListener() {}, removeEventListener() {}, append() {}, remove() {}, focus() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, contains: () => false,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    getBoundingClientRect: () => ({ width: 320, height: 320, left: 0, top: 0 }),
    getClientRects: () => [], scrollIntoView() {},
  });
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, make(id));
    return nodes.get(id);
  };
  byId("admin-data").textContent = payload;

  const previous = {};
  const globals = {
    document: {
      getElementById: byId,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ ...make(), getContext: () => ({ drawImage() {}, imageSmoothingQuality: "" }), toBlob() {} }),
      createRange: () => ({ createContextualFragment: () => ({ firstElementChild: make() }) }),
      body: make("body"),
      documentElement: make("html"),
      addEventListener() {},
      get activeElement() { return make(); },
    },
    window: { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    history: { replaceState() {}, pushState() {} },
    location: { pathname: "/admin/cafe", search: "", href: "http://localhost/admin/cafe" },
    CSS: { escape: (value) => String(value) },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    requestAnimationFrame: (fn) => fn(),
  };
  for (const [name, value] of Object.entries(globals)) {
    previous[name] = globalThis[name];
    globalThis[name] = value;
  }
  return {
    nodes,
    restore() { for (const [name, value] of Object.entries(previous)) globalThis[name] = value; },
  };
}

// admin.js imports /search.js by an absolute browser path, so the three files
// are laid out side by side in a temp folder and that one import rewritten.
async function moduleUrl() {
  const dir = await mkdtemp(join(tmpdir(), "chichkhan-admin-"));
  const source = await readFile(new URL("src/admin/admin.js", repo), "utf8");
  await writeFile(join(dir, "admin.js"), source.replace("`/search.js${version}`", "`./search.js${version}`"));
  await copyFile(new URL("src/admin/shared.js", repo), join(dir, "shared.js"));
  await copyFile(new URL("src/search.js", repo), join(dir, "search.js"));
  return { url: pathToFileURL(join(dir, "admin.js")).href, dir };
}

const venue = {
  slug: "cafe", label: "Café", name: "Chichkhan Café", title: "Chichkhan", subtitle: "Café",
  eyebrow: "Djerba", heroImageKey: "venues/cafe/hero-1234567890.webp", heroImageAlt: "La façade",
  logoImageKey: null, heroImageUrl: "http://localhost/uploads/venues/cafe/hero-1234567890.webp", logoImageUrl: null,
};

test("the editor's browser module draws the whole page without throwing", async () => {
  const { url, dir } = await moduleUrl();
  const payload = JSON.stringify({
    venue: "cafe",
    username: "owner",
    colors: ["#dce5d9", "#e7dcd0", "#ede4c9", "#d3e3dc", "#d8e5e8", "#e9d8cf"],
    state: {
      venue,
      groups: [{ id: 4, name: "À table", position: 1 }],
      categories: [
        { id: 12, groupId: 4, slug: "petits-dejeuners", name: "Petits déjeuners", note: "", imageKey: "categories/cafe/pd-1234567890.webp", imageUrl: "http://localhost/uploads/categories/cafe/pd-1234567890.webp", isVisible: true, position: 1 },
        { id: 13, groupId: null, slug: "cafes", name: "Cafés", note: "", imageKey: null, imageUrl: null, isVisible: false, position: 2 },
      ],
      products: [
        { id: 90, categoryId: 12, name: "Benna", description: "Café ou infusion", millimes: 26500, isHouse: true, isVisible: true, imageKey: null, imageUrl: null, position: 1 },
        { id: 91, categoryId: 13, name: "Express", description: "", millimes: 3500, isHouse: false, isVisible: false, imageKey: null, imageUrl: null, position: 1 },
      ],
      uploads: { enabled: true, maxBytes: 4 * 1024 * 1024, local: true },
    },
  });

  const dom = stubDom(payload);
  try {
    // Any ReferenceError or TypeError in the drawing path surfaces here, which
    // is what a deleted helper with a surviving call site looks like.
    await import(url);
    // The editor really drew: the shell, the venue band and the category list.
    assert.match(dom.nodes.get("app").innerHTML, /editor-layout/, "the workspace frame was drawn");
    assert.match(dom.nodes.get("venue-header").innerHTML, /band-title/, "the venue band was drawn");
    assert.match(dom.nodes.get("venue-header").innerHTML, /Chichkhan/, "the band shows the venue");
    assert.match(dom.nodes.get("side-nav").innerHTML, /Petits déjeuners/, "the categories were listed");
    assert.match(dom.nodes.get("picker-select").innerHTML, /Petits déjeuners/, "the Afficher menu was filled");
    // The photo shown is the crop itself; nothing repositions it any more.
    assert.doesNotMatch(dom.nodes.get("venue-header").innerHTML, /object-position/, "the band shows the crop as saved");
  } finally {
    dom.restore();
    await rm(dir, { recursive: true, force: true });
  }
});
