/**
 * Seed a login user (bcrypt hash → users table).
 *
 * Usage:
 *   npm run seed:user -- --username admin --password secret
 *   SEED_USERNAME=admin SEED_PASSWORD=secret npm run seed:user
 */
import "../config/load-env.js";
import { createUser } from "../services/UserService.js";
import { prisma } from "../config/db.js";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

async function main() {
  const username =
    arg("username")?.trim() ||
    process.env.SEED_USERNAME?.trim() ||
    "";
  const password = arg("password") || process.env.SEED_PASSWORD || "";

  if (!username || !password) {
    console.error(
      "Usage: npm run seed:user -- --username <user> --password <pass>\n" +
        "   or: SEED_USERNAME=... SEED_PASSWORD=... npm run seed:user",
    );
    process.exit(1);
  }

  const user = await createUser(username, password);
  console.log(`[seed:user] created id=${user.id} username=${user.username}`);
}

main()
  .catch((err) => {
    console.error("[seed:user] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
