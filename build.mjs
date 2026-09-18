// Builds the static layer only: styles, browser scripts, fonts and favicon.
// The menu pages themselves are rendered per request by api/menu.js from Neon,
// and the admin pages by api/admin.js; src/admin/ is published to
// /assets/admin/ for them.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./src/", import.meta.url));
const output = fileURLToPath(new URL("./dist/", import.meta.url));
const files = ["style.css", "menu.js", "selection.js", "search.js", "assets/fonts", "assets/logo-96.png"];
const admin = ["admin.css", "admin.js", "page.js", "shared.js"];
rmSync(output, { recursive: true, force: true });
for (const file of files) cpSync(`${source}${file}`, `${output}${file}`, { recursive: true });
for (const file of admin) cpSync(`${source}admin/${file}`, `${output}assets/admin/${file}`);
console.log(`dist: ${files.join(", ")}, assets/admin/{${admin.join(",")}}`);
