// An in-process Postgres (PGlite, compiled to WebAssembly) loaded from
// db/schema.sql and db/seed.sql, so the admin SQL runs for real in tests
// with no database server, credentials or network.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (file) => readFileSync(new URL(`../../db/${file}`, import.meta.url), "utf8");

let template;
async function seededTemplate() {
  if (!template) {
    template = (async () => {
      const pg = await PGlite.create();
      await pg.exec(read("schema.sql"));
      await pg.exec(read("seed.sql"));
      return pg;
    })();
  }
  return template;
}

// The same query/transaction interface lib/database.js provides.
export const asDatabase = (pg) => ({
  query: (text, params) => pg.query(text, params),
  transaction: (fn) => pg.transaction((tx) => fn(tx)),
});

// A fresh copy of the seeded database for one test.
export async function freshDatabase() {
  const pg = await (await seededTemplate()).clone();
  return { pg, db: asDatabase(pg), close: () => pg.close() };
}

export async function closeTemplate() {
  if (template) await (await template).close();
  template = undefined;
}
