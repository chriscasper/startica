import { defineConfig } from "drizzle-kit";

// `yarn db:generate` writes SQL migrations from src/schema.ts into ./migrations.
// The app applies them on startup (migrateDatabase).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
});
