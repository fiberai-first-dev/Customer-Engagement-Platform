import "./config/load-env.js";
import { env } from "./config/env.js";
import { prisma } from "./config/db.js";
import { buildApp } from "./app.js";
import { runDatabaseMigrations } from "./scripts/migrate.js";
import { ensureWorkspace } from "./services/WorkspaceService.js";

async function main() {
  await runDatabaseMigrations();
  await ensureWorkspace();

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
