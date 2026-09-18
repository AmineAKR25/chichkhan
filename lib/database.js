import pg from "pg";

// Production data lives in Neon. The public menu reads Neon over its HTTP
// driver (one round trip per page, see lib/db.js). Any other Postgres, such
// as the throwaway development database from scripts/local.mjs, and every
// admin transaction use the standard Postgres protocol through node-postgres,
// which Neon also accepts.
export function isNeonUrl(url) {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

// One small pool per connection string, reused while the function is warm.
const pools = new Map();
export function getPool(url) {
  let pool = pools.get(url);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 15_000,
    });
    // An idle connection dropped by the server must not crash the process.
    pool.on("error", (error) => console.error(`[db] idle connection closed: ${error.message}`));
    pools.set(url, pool);
  }
  return pool;
}

export async function closePools() {
  const all = [...pools.values()];
  pools.clear();
  await Promise.all(all.map((pool) => pool.end().catch(() => {})));
}

// The small interface lib/admin/store.js works against: query(text, params)
// and transaction(fn). Tests pass an in-process PGlite with the same shape.
export function openDatabase(url) {
  const pool = getPool(url);
  return {
    query: (text, params) => pool.query(text, params),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn(client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export function withTimeout(promise, ms, message = "timed out") {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]);
}
