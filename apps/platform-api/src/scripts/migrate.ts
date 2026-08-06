/**
 * Database bootstrap without `prisma migrate deploy` (hangs on Supabase pooler).
 *
 * Paths:
 * - Empty DB → apply init SQL, then inbox SQL, baseline history
 * - Legacy account-centric DB → apply inbox SQL repair, baseline
 * - Current schema → baseline history if missing
 */
import "../config/load-env.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/client/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const migrationsDir = path.join(apiRoot, "prisma", "migrations");

export function encodePasswordAtSigns(url: string): string {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return url;
  const rest = url.slice(schemeIdx + 3);
  const slashIdx = rest.search(/[/?]/);
  const authority = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  const after = slashIdx >= 0 ? rest.slice(slashIdx) : "";
  const at = authority.lastIndexOf("@");
  if (at < 0) return url;
  const userinfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon < 0) return url;
  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  if (!password.includes("@")) return url;
  return `${url.slice(0, schemeIdx + 3)}${user}:${password.replace(/@/g, "%40")}@${host}${after}`;
}

function resolveDatabaseUrl(): string {
  const raw =
    process.env.PLATFORM_MIGRATE_DATABASE_URL ||
    process.env.PLATFORM_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "";
  if (!raw) throw new Error("Missing PLATFORM_DATABASE_URL / PLATFORM_MIGRATE_DATABASE_URL");
  return encodePasswordAtSigns(raw.replace(/^["']|["']$/g, ""));
}

async function flag(
  prisma: PrismaClient,
  sql: string,
  ...params: unknown[]
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(sql, ...params);
  return Boolean(rows[0]?.exists);
}

function listMigrationFolders(): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function migrationSqlPath(folder: string): string {
  return path.join(migrationsDir, folder, "migration.sql");
}

async function ensureMigrationsTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function markApplied(prisma: PrismaClient, name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
    `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1`,
    name,
  );
  if (rows.length) return;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
    randomUUID(),
    "bootstrap",
    name,
  );
}

async function baselineAllMigrations(prisma: PrismaClient) {
  const folders = listMigrationFolders();
  await ensureMigrationsTable(prisma);
  for (const folder of folders) await markApplied(prisma, folder);
}

/** Split SQL into executable chunks, keeping DO $$ ... $$; blocks intact. */
function splitSql(sql: string): string[] {
  const chunks: string[] = [];
  let buf = "";
  let inDo = false;
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!inDo && trimmed.startsWith("--")) continue;
    if (!inDo && /^DO\s+\$\$/i.test(trimmed)) inDo = true;
    buf += `${line}\n`;
    if (inDo && /\$\$\s*;\s*$/.test(trimmed)) {
      inDo = false;
      chunks.push(buf.trim());
      buf = "";
      continue;
    }
    if (!inDo && trimmed.endsWith(";") && !trimmed.startsWith("--")) {
      chunks.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

async function applySqlFile(prisma: PrismaClient, filePath: string) {
  if (!existsSync(filePath)) throw new Error(`Missing SQL file: ${filePath}`);
  console.log(`[migrate] applying ${path.relative(apiRoot, filePath)}`);
  const chunks = splitSql(readFileSync(filePath, "utf8"));
  for (const chunk of chunks) {
    await prisma.$executeRawUnsafe(chunk);
  }
}

async function isEmptyDatabase(prisma: PrismaClient): Promise<boolean> {
  return !(await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='accounts') AS exists`,
  ));
}

async function needsLegacyRepair(prisma: PrismaClient): Promise<boolean> {
  if (await isEmptyDatabase(prisma)) return false;
  const hasInboxes = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inboxes') AS exists`,
  );
  const hasInboxId = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' AND column_name='inbox_id') AS exists`,
  );
  const hasLegacyConfig = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='whatsapp_config') AS exists`,
  );
  return !hasInboxes || !hasInboxId || hasLegacyConfig;
}

async function schemaLooksCurrent(prisma: PrismaClient): Promise<boolean> {
  const hasInboxes = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inboxes') AS exists`,
  );
  const hasInboxId = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' AND column_name='inbox_id') AS exists`,
  );
  const hasWebhook = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='webhook_events') AS exists`,
  );
  const hasContactChannels = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='whatsapp_enabled') AS exists`,
  );
  const hasEmailsArray = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='emails') AS exists`,
  );
  const hasWhatsappIds = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='whatsapp_ids') AS exists`,
  );
  const hasPhone = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='phone') AS exists`,
  );
  const hasIdentityTable = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contact_identities') AS exists`,
  );
  return (
    hasInboxes &&
    hasInboxId &&
    hasWebhook &&
    hasContactChannels &&
    hasEmailsArray &&
    hasWhatsappIds &&
    !hasPhone &&
    !hasIdentityTable
  );
}

async function needsContactChannelMigration(prisma: PrismaClient): Promise<boolean> {
  if (await isEmptyDatabase(prisma)) return false;
  const hasContacts = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contacts') AS exists`,
  );
  if (!hasContacts) return false;
  const hasContactChannels = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='whatsapp_enabled') AS exists`,
  );
  const hasIdentityTable = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contact_identities') AS exists`,
  );
  return !hasContactChannels || hasIdentityTable;
}

async function migrationHistoryMissing(prisma: PrismaClient): Promise<boolean> {
  const hasTable = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations') AS exists`,
  );
  if (!hasTable) return true;
  const folders = listMigrationFolders();
  if (!folders.length) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*)::bigint AS c FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  return Number(rows[0]?.c ?? 0) < folders.length;
}

export async function runDatabaseMigrations(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  process.env.PLATFORM_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;

  console.log("[migrate] connecting…");
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$queryRawUnsafe(`SELECT 1`);
    const folders = listMigrationFolders();
    if (!folders.length) throw new Error("No prisma/migrations folders found");

    const inboxMig =
      folders.find((f) => f.includes("inbox_contact_identity")) ?? folders[1]!;
    const contactMig =
      folders.find((f) => f.includes("contact_channel_columns")) ?? folders.at(-1)!;

    if (await isEmptyDatabase(prisma)) {
      console.log("[migrate] Empty database — applying all SQL migrations");
      for (const folder of folders) {
        await applySqlFile(prisma, migrationSqlPath(folder));
      }
      await baselineAllMigrations(prisma);
      console.log("[migrate] Fresh schema ready");
      return;
    }

    if (await needsLegacyRepair(prisma)) {
      console.log("[migrate] Legacy schema — applying inbox SQL repair");
      await applySqlFile(prisma, migrationSqlPath(inboxMig));
      if (await needsContactChannelMigration(prisma)) {
        await applySqlFile(prisma, migrationSqlPath(contactMig));
      }
      await baselineAllMigrations(prisma);
      console.log("[migrate] Repair complete");
      return;
    }

    if (await needsContactChannelMigration(prisma)) {
      console.log("[migrate] Flattening contacts → channel columns");
      await applySqlFile(prisma, migrationSqlPath(contactMig));
      await baselineAllMigrations(prisma);
      console.log("[migrate] Contact channel columns ready");
      return;
    }

    const emailsPhonesMig =
      folders.find((f) => f.includes("contact_emails_phones")) ?? null;
    if (emailsPhonesMig) {
      const hasEmailsArray = await flag(
        prisma,
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='emails') AS exists`,
      );
      if (!hasEmailsArray) {
        console.log("[migrate] Adding contacts.emails / contacts.phones arrays");
        await applySqlFile(prisma, migrationSqlPath(emailsPhonesMig));
        await markApplied(prisma, emailsPhonesMig);
        console.log("[migrate] emails/phones arrays ready");
      }
    }

    const dropPhoneMig =
      folders.find((f) => f.includes("drop_phone_use_whatsapp")) ?? null;
    if (dropPhoneMig) {
      const hasPhone = await flag(
        prisma,
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='phone') AS exists`,
      );
      const hasWhatsappIds = await flag(
        prisma,
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='whatsapp_ids') AS exists`,
      );
      if (hasPhone || !hasWhatsappIds) {
        console.log("[migrate] Dropping phone; adding whatsapp_ids");
        await applySqlFile(prisma, migrationSqlPath(dropPhoneMig));
        await markApplied(prisma, dropPhoneMig);
        console.log("[migrate] whatsapp_ids ready");
        return;
      }
    }

    if ((await schemaLooksCurrent(prisma)) && (await migrationHistoryMissing(prisma))) {
      console.log("[migrate] Schema current — baselining Prisma history");
      await baselineAllMigrations(prisma);
      return;
    }

    if (await schemaLooksCurrent(prisma)) {
      console.log("[migrate] Schema already up to date");
      return;
    }

    throw new Error(
      "Database schema is unexpected. Re-run after checking tables, or restore from backup.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/migrate.ts") ||
    path.resolve(process.argv[1]).replace(/\\/g, "/").endsWith("/migrate.js")
  : false;

if (invokedDirectly) {
  runDatabaseMigrations()
    .then(() => {
      console.log("[migrate] OK");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] FAILED", err);
      process.exit(1);
    });
}
