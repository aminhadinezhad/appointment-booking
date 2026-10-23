// Runs a real PostgreSQL server from node_modules for local development
// when neither Docker nor a system-wide PostgreSQL is available.
// Usage: npm run db          (keeps running; Ctrl+C to stop)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
const databaseDir = path.resolve(".data", "postgres");
const databases = ["booking", "booking_test"];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  // Without these flags initdb on Windows inherits the ANSI code page (WIN1252),
  // which cannot store Persian text.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (message) => console.error("[postgres]", String(message).trim()),
});

const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));
if (firstRun) {
  console.log("Initialising PostgreSQL data directory...");
  await pg.initialise();
}

await pg.start();

const client = pg.getPgClient();
await client.connect();
for (const name of databases) {
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    console.log(`Created database "${name}"`);
  }
  // Store and compare timestamps in UTC regardless of the host time zone.
  await client.query(`ALTER DATABASE "${name}" SET timezone TO 'UTC'`);
}
await client.end();

console.log(`PostgreSQL is running on postgresql://postgres:postgres@localhost:${port}`);
console.log("Press Ctrl+C to stop.");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping PostgreSQL...");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
