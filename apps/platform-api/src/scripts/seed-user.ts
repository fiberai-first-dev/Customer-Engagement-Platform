/**
 * Seed a login user (bcrypt hash → users table).
 *
 * Usage:
 *   npm run seed:user -- --username admin --password secret
 *   npm run seed:user -- --username admin --password secret --force   # update password if exists
 *   SEED_USERNAME=admin SEED_PASSWORD=secret npm run seed:user
 *
 * Docker:
 *   docker compose exec platform-api node dist/scripts/seed-user.js --username admin --password '…'
 *   docker compose exec platform-api node dist/scripts/seed-user.js --username admin --password '…' --force
 */
import "../config/load-env.js";
import bcrypt from "bcrypt";
import { createUser } from "../services/UserService.js";
import { prisma } from "../config/db.js";

const SALT_ROUNDS = 10;

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const username =
    arg("username")?.trim() ||
    process.env.SEED_USERNAME?.trim() ||
    "";
  const password = arg("password") || process.env.SEED_PASSWORD || "";
  const force = hasFlag("force") || process.env.SEED_FORCE === "1";

  if (!username || !password) {
    console.error(
      "Usage: npm run seed:user -- --username <user> --password <pass> [--force]\n" +
        "   or: SEED_USERNAME=... SEED_PASSWORD=... npm run seed:user",
    );
    process.exit(1);
  }

  if (password.length < 4) {
    console.error("[seed:user] password must be at least 4 characters");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    if (!force) {
      console.error(
        `[seed:user] FAILED username already exists (use --force to reset password)`,
      );
      process.exit(1);
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    console.log(`[seed:user] password updated id=${existing.id} username=${existing.username}`);
    return;
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
