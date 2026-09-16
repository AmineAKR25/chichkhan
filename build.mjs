// Builds the static layer only: styles, browser scripts, fonts and favicon.
// The menu pages themselves are rendered per request by api/menu.js from Neon.
import { cpSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./src/", import.meta.url));
const output = fileURLToPath(new URL("./dist/", import.meta.url));
const files = ["style.css", "menu.js", "selection.js", "search.js", "assets/fonts", "assets/logo-96.png"];
rmSync(output, { recursive: true, force: true });
for (const file of files) cpSync(`${source}${file}`, `${output}${file}`, { recursive: true });
console.log(`dist: ${files.join(", ")}`);
