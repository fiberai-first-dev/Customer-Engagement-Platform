import "./config/load-env.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { buildApp } from "./app.js";
import { runDatabaseMigrations } from "./scripts/migrate.js";

async function main() {
  // Always migrate/repair before accepting traffic (fresh + outdated DBs).
  await runDatabaseMigrations();

  const app = await buildApp();
  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    app.log.info(`platform-api listening on :${env.port}`);
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
