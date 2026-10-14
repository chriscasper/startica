/**
 * Loads the fictional demo product (Fieldnote) into a Startica data folder, for
 * screenshots, smoke tests and trying the app without your own data. No AI calls.
 *
 *   STARTICA_DATA_DIR=/tmp/startica-demo yarn seed:demo [--force]
 *   STARTICA_DATA_DIR=/tmp/startica-demo yarn dev:desktop-web
 *
 * STARTICA_DATA_DIR (an absolute path) is required so the demo never lands in your real data folder
 * by accident. Refuses to run if the database already has a product; --force
 * first deletes every product with its data (plus conversations, job and AI
 * history), keeping settings, secrets and AI model routing.
 */
import { isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";
import { closeDatabase, migrateDatabase, openDatabase } from "@startica/db/client";
import { databasePath } from "@startica/db/paths";
import { clearProductData, productCount, seedDemo } from "../src/demo/seed.ts";

const { values } = parseArgs({ options: { force: { type: "boolean", default: false } } });

if (!process.env.STARTICA_DATA_DIR) {
  console.error("Set STARTICA_DATA_DIR to the data folder to seed, e.g.\n  STARTICA_DATA_DIR=/tmp/startica-demo yarn seed:demo");
  process.exit(1);
}

// Yarn runs workspace scripts from the package folder, so a relative path would land there.
if (!isAbsolute(process.env.STARTICA_DATA_DIR)) {
  console.error(`STARTICA_DATA_DIR must be an absolute path (got "${process.env.STARTICA_DATA_DIR}"), e.g. STARTICA_DATA_DIR="$PWD/demo-data"`);
  process.exit(1);
}

const path = databasePath();
openDatabase(path);
await migrateDatabase(join(import.meta.dirname, "../../db/migrations"));

const existing = await productCount();
if (existing > 0 && !values.force) {
  console.error(`${path} already has ${existing} product(s). Rerun with --force to delete them and their data first.`);
  closeDatabase();
  process.exit(1);
}
if (existing > 0) {
  await clearProductData();
  console.log(`Deleted ${existing} existing product(s) and their data.`);
}

const { counts } = await seedDemo();
closeDatabase();
console.log(`Seeded the Fieldnote demo into ${path}:`);
for (const [name, n] of Object.entries(counts)) console.log(`  ${name}: ${n}`);
console.log(`\nOpen it with: STARTICA_DATA_DIR=${process.env.STARTICA_DATA_DIR} yarn dev:desktop-web`);
