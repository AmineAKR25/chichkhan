// Local development services, for building and reviewing the site without
// Neon, Cloudflare R2 or any production secret.
//
//   npm run local:setup    create a throwaway Postgres (from db/schema.sql and
//                          db/seed.sql), local admin credentials and, when a
//                          local S3 service is installed, a public-read bucket;
//                          writes their settings into .env.local
//   npm run local:start    start those services and the site at :4173, and
//                          stop the services again on Ctrl+C
//   npm run local:stop     stop the services
//   npm run local:reset    recreate the local database from schema and seed
//   npm run local:status   show what is running and the local admin sign-in
//
// Everything lives in .local/ (git-ignored). Production keeps using Neon and
// R2; nothing here is used by the deployed site.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { hashPassword } from "../lib/admin/auth.js";
import { createAccessLinkToken } from "../lib/admin/link.js";
import { createStorage, storageConfig } from "../lib/admin/storage.js";

const repo = fileURLToPath(new URL("../", import.meta.url));
const local = join(repo, ".local");
const envFile = join(repo, ".env.local");
const isWindows = process.platform === "win32";
const exe = (name) => (isWindows ? `${name}.exe` : name);
const PG_PORT = Number(process.env.LOCAL_PG_PORT || 54329);
const S3_PORT = Number(process.env.LOCAL_S3_PORT || 8333);
const BUCKET = "chichkhan-menu";
const pgDir = join(local, "postgres");
const pgData = join(pgDir, "data");
const storageDir = join(local, "storage");
const secretsFile = join(local, "secrets.json");

const say = (message = "") => console.log(message);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Finding the tools

function onPath(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (dir && existsSync(join(dir, exe(name)))) return join(dir, exe(name));
  }
  return null;
}

function newestFirst(parent, pattern) {
  if (!existsSync(parent)) return [];
  return readdirSync(parent).filter((name) => pattern.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((name) => join(parent, name));
}

function findPostgres() {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  const onPathDir = onPath("pg_ctl");
  if (onPathDir) candidates.push(resolve(onPathDir, ".."));
  if (isWindows) {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean)) {
      candidates.push(...newestFirst(join(base, "PostgreSQL"), /^\d+(\.\d+)?$/).map((dir) => join(dir, "bin")));
    }
  } else {
    candidates.push(...newestFirst("/opt/homebrew/opt", /^postgresql(@\d+)?$/).map((dir) => join(dir, "bin")));
    candidates.push(...newestFirst("/usr/local/opt", /^postgresql(@\d+)?$/).map((dir) => join(dir, "bin")));
    candidates.push("/Applications/Postgres.app/Contents/Versions/latest/bin");
    candidates.push(...newestFirst("/usr/lib/postgresql", /^\d+$/).map((dir) => join(dir, "bin")));
  }
  return candidates.find((dir) => existsSync(join(dir, exe("initdb"))) && existsSync(join(dir, exe("pg_ctl")))) ?? null;
}

// Any S3-compatible service works. MinIO and SeaweedFS are started for you
// when their program is found (MINIO_BIN / WEED_BIN, PATH, or .local/bin).
function findStorageServer() {
  const pick = (variable, name) => [process.env[variable], onPath(name), join(local, "bin", exe(name))].find((path) => path && existsSync(path));
  const minio = pick("MINIO_BIN", "minio");
  if (minio) return { kind: "minio", path: minio };
  const weed = pick("WEED_BIN", "weed");
  if (weed) return { kind: "seaweedfs", path: weed };
  return null;
}

// ---------------------------------------------------------------------------
// Secrets and .env.local

function secrets() {
  mkdirSync(local, { recursive: true });
  const saved = readJson(secretsFile, {});
  const value = {
    databasePassword: saved.databasePassword ?? randomBytes(18).toString("base64url"),
    adminUsername: saved.adminUsername ?? "admin",
    adminPassword: saved.adminPassword ?? randomBytes(12).toString("base64url"),
    adminPasswordHash: saved.adminPasswordHash ?? null,
    sessionSecret: saved.sessionSecret ?? randomBytes(32).toString("base64url"),
    linkSecret: saved.linkSecret ?? randomBytes(32).toString("base64url"),
    s3AccessKey: saved.s3AccessKey ?? `local${randomBytes(6).toString("hex")}`,
    s3SecretKey: saved.s3SecretKey ?? randomBytes(24).toString("base64url"),
  };
  return value;
}
const saveSecrets = (value) => writeFileSync(secretsFile, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });

const databaseUrl = (s) => `postgres://chichkhan:${encodeURIComponent(s.databasePassword)}@127.0.0.1:${PG_PORT}/chichkhan`;
const START = "# >>> local development (written by scripts/local.mjs; local-only values, never used in production)";
const END = "# <<< local development";

// The managed block in .env.local is rewritten; everything else is kept.
// A setting defined outside the block is never silently overridden.
function writeEnv(values, { force = false } = {}) {
  const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const outside = current.replace(new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}\\r?\\n?`), "");
  const conflicts = Object.keys(values).filter((key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(outside));
  if (conflicts.length && !force) {
    fail(`.env.local already sets ${conflicts.join(", ")} outside the local block.\n  Move those lines aside (they may point at production), or rerun with:\n  npm run local:setup -- --force   (comments them out)`);
  }
  // Empty or overridden duplicates are commented out so they cannot shadow the block.
  const kept = outside.replace(new RegExp(`^(\\s*(?:${Object.keys(values).join("|")})\\s*=.*)$`, "gm"), "# replaced by local setup: $1");
  const block = [START, ...Object.entries(values).map(([key, value]) => `${key}=${value}`), END].join("\n");
  const text = `${kept.trimEnd()}${kept.trim() ? "\n\n" : ""}${block}\n`;
  writeFileSync(envFile, text, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Postgres

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}

function postgresRunning(bin) {
  return existsSync(pgData) && run(join(bin, exe("pg_ctl")), ["status", "-D", pgData]).status === 0;
}

function initPostgres(bin, s) {
  if (existsSync(join(pgData, "PG_VERSION"))) return false;
  mkdirSync(pgDir, { recursive: true });
  const pwfile = join(pgDir, "initial-password.txt");
  writeFileSync(pwfile, s.databasePassword, { mode: 0o600 });
  const result = run(join(bin, exe("initdb")), ["-D", pgData, "-U", "chichkhan", `--pwfile=${pwfile}`, "-A", "scram-sha-256", "-E", "UTF8", "--no-locale"]);
  rmSync(pwfile, { force: true });
  if (result.status !== 0) fail(`initdb failed:\n${result.stderr || result.stdout}`);
  // Only this machine can connect, on its own port, next to any other Postgres.
  const conf = join(pgData, "postgresql.conf");
  writeFileSync(conf, `${readFileSync(conf, "utf8")}\n# scripts/local.mjs\nport = ${PG_PORT}\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n`);
  return true;
}

function startPostgres(bin) {
  if (postgresRunning(bin)) return false;
  // No pipes: the server inherits pg_ctl's handles and would keep them open.
  const log = join(pgDir, "server.log");
  const result = run(join(bin, exe("pg_ctl")), ["start", "-D", pgData, "-l", log, "-w", "-t", "60"], { stdio: "ignore" });
  if (result.status !== 0) {
    const tail = existsSync(log) ? readFileSync(log, "utf8").trim().split(/\r?\n/).slice(-8).join("\n") : "";
    fail(`Postgres did not start (is port ${PG_PORT} free? Set LOCAL_PG_PORT to use another). From .local/postgres/server.log:\n${tail}`);
  }
  return true;
}

function stopPostgres(bin) {
  if (!bin || !postgresRunning(bin)) return false;
  run(join(bin, exe("pg_ctl")), ["stop", "-D", pgData, "-m", "fast", "-w"], { stdio: "ignore" });
  return true;
}

async function withClient(s, database, fn) {
  const client = new pg.Client({ connectionString: databaseUrl(s).replace(/\/chichkhan$/, `/${database}`) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const sqlFile = (name) => readFileSync(join(repo, "db", name), "utf8");

async function prepareDatabase(s, { reset = false } = {}) {
  await withClient(s, "postgres", async (client) => {
    if (reset) await client.query("drop database if exists chichkhan with (force)");
    const exists = (await client.query("select 1 from pg_database where datname = 'chichkhan'")).rows.length;
    if (!exists) await client.query("create database chichkhan");
  });
  return withClient(s, "chichkhan", async (client) => {
    const loaded = (await client.query("select to_regclass('public.venues') is not null as loaded")).rows[0].loaded;
    if (!loaded) {
      await client.query(sqlFile("schema.sql"));
      await client.query(sqlFile("seed.sql"));
      return "created";
    }
    // An older local database gets any newer migrations (they are idempotent).
    const migrations = existsSync(join(repo, "db", "migrations")) ? readdirSync(join(repo, "db", "migrations")).filter((f) => f.endsWith(".sql")).sort() : [];
    for (const file of migrations) await client.query(sqlFile(join("migrations", file)));
    return "kept";
  });
}

// ---------------------------------------------------------------------------
// Local S3 service

const pidFile = join(storageDir, "server.pid");
function storagePid() {
  const pid = Number(readJson(pidFile, {}).pid);
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function storageEnv(s) {
  return {
    S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
    S3_REGION: "us-east-1",
    S3_BUCKET: BUCKET,
    S3_ACCESS_KEY_ID: s.s3AccessKey,
    S3_SECRET_ACCESS_KEY: s.s3SecretKey,
    R2_PUBLIC_BASE_URL: `http://127.0.0.1:${S3_PORT}/${BUCKET}`,
  };
}

async function startStorage(server, s) {
  if (storagePid()) return false;
  mkdirSync(join(storageDir, "data"), { recursive: true });
  const log = openSync(join(storageDir, "server.log"), "a");
  let child;
  if (server.kind === "minio") {
    child = spawn(server.path, ["server", join(storageDir, "data"), "--address", `127.0.0.1:${S3_PORT}`, "--console-address", `127.0.0.1:${S3_PORT + 1}`], {
      env: { ...process.env, MINIO_ROOT_USER: s.s3AccessKey, MINIO_ROOT_PASSWORD: s.s3SecretKey },
      stdio: ["ignore", log, log], detached: true, windowsHide: true,
    });
  } else {
    // SeaweedFS: one process; the anonymous identity may only read this bucket.
    const config = join(storageDir, "s3.json");
    writeFileSync(config, JSON.stringify({
      identities: [
        { name: "local-admin", credentials: [{ accessKey: s.s3AccessKey, secretKey: s.s3SecretKey }], actions: ["Admin", "Read", "List", "Tagging", "Write"] },
        { name: "anonymous", actions: [`Read:${BUCKET}`] },
      ],
    }, null, 2), { mode: 0o600 });
    child = spawn(server.path, ["mini", `-dir=${join(storageDir, "data")}`, "-ip=127.0.0.1", "-ip.bind=127.0.0.1", `-s3.port=${S3_PORT}`, `-s3.config=${config}`,
      `-bucket=${BUCKET}`, "-webdav=false", "-admin.ui=false", "-s3.port.iceberg=0", "-s3.port.lance=0"], {
      stdio: ["ignore", log, log], detached: true, windowsHide: true,
    });
  }
  child.unref();
  writeFileSync(pidFile, JSON.stringify({ pid: child.pid, kind: server.kind }));
  const storage = createStorage(storageConfig(storageEnv(s)));
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise((done) => setTimeout(done, 500));
    try {
      await storage.ensurePublicBucket();
      return true;
    } catch { /* still starting */ }
  }
  fail(`The ${server.kind} storage service did not start. See .local/storage/server.log.`);
}

function stopStorage() {
  const pid = storagePid();
  if (!pid) return false;
  if (isWindows) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(-pid, "SIGTERM");
  rmSync(pidFile, { force: true });
  return true;
}

// ---------------------------------------------------------------------------
// Commands

async function setup({ force = false } = {}) {
  const bin = findPostgres();
  if (!bin) {
    fail("PostgreSQL was not found. Install PostgreSQL 15 or later (postgresql.org/download),\n  or set PG_BIN to the folder that contains initdb and pg_ctl, then run this again.");
  }
  const s = secrets();
  s.adminPasswordHash ??= await hashPassword(s.adminPassword);
  saveSecrets(s);
  say(`PostgreSQL: ${bin}`);
  if (initPostgres(bin, s)) say(`  created a local cluster in .local/postgres (port ${PG_PORT})`);
  const started = startPostgres(bin);
  const outcome = await prepareDatabase(s);
  say(outcome === "created" ? "  loaded db/schema.sql and db/seed.sql" : "  kept the existing local data (npm run local:reset starts over)");

  const server = findStorageServer();
  const values = {
    DATABASE_URL: databaseUrl(s),
    ADMIN_USERNAME: s.adminUsername,
    ADMIN_PASSWORD_HASH: s.adminPasswordHash,
    ADMIN_SESSION_SECRET: s.sessionSecret,
    ADMIN_LINK_SECRET: s.linkSecret,
  };
  if (server) {
    say(`Storage: ${server.kind} (${server.path})`);
    const storageStarted = await startStorage(server, s);
    say(`  bucket “${BUCKET}” ready at http://127.0.0.1:${S3_PORT}/${BUCKET}`);
    if (storageStarted) stopStorage();
    Object.assign(values, storageEnv(s));
  } else {
    say("Storage: no local S3 service found, so image uploads stay off (“Image uploads are not configured locally.”).");
    say("  To try uploads, install MinIO or SeaweedFS (github.com/seaweedfs/seaweedfs/releases), or put");
    say("  its program in .local/bin/ or set MINIO_BIN / WEED_BIN, then run npm run local:setup again.");
  }
  if (started) stopPostgres(bin);
  writeEnv(values, { force });
  say("\nWrote the local settings to .env.local (git-ignored).");
  await printSignIn(s);
  say("Next: npm run local:start");
}

// The console has no public address, so development needs a real owner link
// too. This one never expires and only works against this local machine.
async function printSignIn(s) {
  const port = process.env.PORT || 4173;
  const link = `http://localhost:${port}/owner-access/${await createAccessLinkToken(s.linkSecret, null)}`;
  say(`\nLocal admin sign-in (this machine only):\n  ${link}\n  username: ${s.adminUsername}\n  password: ${s.adminPassword}\n`);
  say("  http://localhost:" + port + "/admin answers 404 until you open that link and sign in.\n");
}

async function start() {
  const bin = findPostgres();
  if (!bin || !existsSync(join(pgData, "PG_VERSION")) || !existsSync(secretsFile)) await setup();
  const s = secrets();
  const startedPg = startPostgres(bin ?? findPostgres());
  await prepareDatabase(s);
  const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const server = findStorageServer();
  let startedStorage = false;
  if (server && env.includes(`S3_ENDPOINT=http://127.0.0.1:${S3_PORT}`)) startedStorage = await startStorage(server, s);
  say(`Postgres on 127.0.0.1:${PG_PORT}${server && startedStorage ? `, ${server.kind} on 127.0.0.1:${S3_PORT}` : ""}.`);
  await printSignIn(s);

  const build = spawnSync(process.execPath, [join(repo, "build.mjs")], { stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const site = spawn(process.execPath, ["--env-file=.env.local", join(repo, "scripts", "serve.mjs")], { cwd: repo, stdio: "inherit" });
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    site.kill();
    if (startedStorage) stopStorage();
    if (startedPg) stopPostgres(bin ?? findPostgres());
    say("\nStopped the local services.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  site.on("exit", shutdown);
}

function stop() {
  const bin = findPostgres();
  const pgStopped = stopPostgres(bin);
  const storageStopped = stopStorage();
  say(pgStopped || storageStopped ? "Stopped the local services." : "Nothing was running.");
}

async function reset() {
  const bin = findPostgres();
  if (!bin || !existsSync(join(pgData, "PG_VERSION"))) fail("There is no local database yet. Run npm run local:setup first.");
  const s = secrets();
  const started = startPostgres(bin);
  await prepareDatabase(s, { reset: true });
  if (started) stopPostgres(bin);
  say("Recreated the local database from db/schema.sql and db/seed.sql. Local edits and history are gone.");
}

async function status() {
  const bin = findPostgres();
  const s = readJson(secretsFile, null);
  say(`Postgres: ${!bin ? "not installed" : !existsSync(pgData) ? "not set up (npm run local:setup)" : postgresRunning(bin) ? `running on 127.0.0.1:${PG_PORT}` : "stopped"}`);
  const server = findStorageServer();
  say(`Storage:  ${!server ? "no MinIO or SeaweedFS found (uploads off)" : storagePid() ? `${server.kind} running on 127.0.0.1:${S3_PORT}` : `${server.kind} stopped`}`);
  if (s) await printSignIn(s);
}

const [command = "status", ...flags] = process.argv.slice(2);
const commands = { setup: () => setup({ force: flags.includes("--force") }), start, stop, reset, status };
if (!commands[command]) fail(`Unknown command ${command}. Use setup, start, stop, reset or status.`);
await commands[command]();
