/**
 * Database bootstrap without `prisma migrate deploy` (hangs on Supabase pooler).
 *
 * Paths:
 * - Empty / incomplete DB → reset CEP objects, apply all SQL, baseline history
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

/** Resolve prisma/migrations whether running from src/ or dist/. */
function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(here, "../../prisma/migrations"), // src/scripts → apiRoot/prisma
    path.resolve(here, "../../../prisma/migrations"), // dist/scripts → apiRoot/prisma
    path.resolve(process.cwd(), "prisma/migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

const migrationsDir = resolveMigrationsDir();
const apiRoot = path.resolve(migrationsDir, "../..");

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

async function tableExists(prisma: PrismaClient, table: string): Promise<boolean> {
  return flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
    table,
  );
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

/** True when core app tables are missing (accounts required). */
async function isEmptyDatabase(prisma: PrismaClient): Promise<boolean> {
  return !(await tableExists(prisma, "accounts"));
}

/**
 * Partial drop leftovers (e.g. only webhook_events + enums) break re-apply of init
 * because CREATE TYPE fails. Detect "some but not all" core tables.
 */
async function isIncompleteSchema(prisma: PrismaClient): Promise<boolean> {
  const core = ["accounts", "inboxes", "contacts", "conversations", "messages", "webhook_events"];
  const present: string[] = [];
  for (const table of core) {
    if (await tableExists(prisma, table)) present.push(table);
  }
  if (present.length === 0) return false; // truly empty — normal empty path
  if (present.length < core.length) {
    console.log(`[migrate] Incomplete schema — found only: ${present.join(", ")}`);
    return true;
  }
  return false;
}

/** Wipe CEP tables + enums so init SQL can run cleanly again. */
async function resetCepSchema(prisma: PrismaClient) {
  console.log("[migrate] Resetting CEP tables and enums for a clean apply…");
  await prisma.$executeRawUnsafe(`
    DROP TABLE IF EXISTS
      "messages",
      "conversations",
      "contacts",
      "inboxes",
      "accounts",
      "webhook_events",
      "contact_identities",
      "_prisma_migrations"
    CASCADE
  `);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ChannelType" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ConversationStatus" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "MessageDirection" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "MessageStatus" CASCADE`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ContentType" CASCADE`);
}

async function applyAllMigrations(prisma: PrismaClient) {
  const folders = listMigrationFolders();
  for (const folder of folders) {
    await applySqlFile(prisma, migrationSqlPath(folder));
  }
  await baselineAllMigrations(prisma);
  console.log("[migrate] Fresh schema ready");
}

async function needsLegacyRepair(prisma: PrismaClient): Promise<boolean> {
  if (await isEmptyDatabase(prisma)) return false;
  const hasInboxes = await tableExists(prisma, "inboxes");
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
  const hasInboxes = await tableExists(prisma, "inboxes");
  const hasInboxId = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' AND column_name='inbox_id') AS exists`,
  );
  const hasWebhook = await tableExists(prisma, "webhook_events");
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
  const hasIdentityTable = await tableExists(prisma, "contact_identities");
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
  const hasContacts = await tableExists(prisma, "contacts");
  if (!hasContacts) return false;
  const hasContactChannels = await flag(
    prisma,
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='contacts' AND column_name='whatsapp_enabled') AS exists`,
  );
  const hasIdentityTable = await tableExists(prisma, "contact_identities");
  return !hasContactChannels || hasIdentityTable;
}

async function migrationHistoryMissing(prisma: PrismaClient): Promise<boolean> {
  const hasTable = await tableExists(prisma, "_prisma_migrations");
  if (!hasTable) return true;
  const folders = listMigrationFolders();
  if (!folders.length) return false;
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*)::bigint AS c FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`,
  );
  return Number(rows[0]?.c ?? 0) < folders.length;
}

function redactDbHost(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export async function runDatabaseMigrations(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();
  process.env.PLATFORM_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;

  console.log(`[migrate] migrations dir: ${migrationsDir}`);
  console.log(`[migrate] connecting → ${redactDbHost(databaseUrl)}`);

  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  try {
    await prisma.$queryRawUnsafe(`SELECT 1`);
    const folders = listMigrationFolders();
    if (!folders.length) {
      throw new Error(`No prisma/migrations folders found under ${migrationsDir}`);
    }
    console.log(`[migrate] found ${folders.length} migration folder(s)`);

    const inboxMig =
      folders.find((f) => f.includes("inbox_contact_identity")) ?? folders[1]!;
    const contactMig =
      folders.find((f) => f.includes("contact_channel_columns")) ?? folders.at(-1)!;

    // Partial leftover schema (common after DROP TABLE while enums remain)
    if (await isIncompleteSchema(prisma)) {
      await resetCepSchema(prisma);
      await applyAllMigrations(prisma);
      return;
    }

    if (await isEmptyDatabase(prisma)) {
      console.log("[migrate] Empty database — applying all SQL migrations");
      // Enums may still exist after a manual table drop — clear them first
      await resetCepSchema(prisma);
      await applyAllMigrations(prisma);
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

    console.log("[migrate] Unexpected schema — forcing clean recreate");
    await resetCepSchema(prisma);
    await applyAllMigrations(prisma);
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
