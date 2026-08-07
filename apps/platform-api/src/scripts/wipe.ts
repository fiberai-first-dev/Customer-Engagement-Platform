/**
 * One-shot: DROP all CEP tables on the configured DB (wipe only).
 * Usage: npx tsx src/scripts/wipe.ts
 */
import "../config/load-env.js";
import { PrismaClient } from "../generated/client/index.js";
import { encodePasswordAtSigns } from "./migrate.js";

function resolveUrl(): string {
  const raw =
    process.env.PLATFORM_MIGRATE_DATABASE_URL ||
    process.env.PLATFORM_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "";
  if (!raw) throw new Error("Missing PLATFORM_MIGRATE_DATABASE_URL / PLATFORM_DATABASE_URL");
  return encodePasswordAtSigns(raw.replace(/^["']|["']$/g, ""));
}

async function main() {
  const url = resolveUrl();
  const host = (() => {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port || "5432"}`;
    } catch {
      return "(unknown)";
    }
  })();
  console.log(`[wipe] connecting → ${host}`);

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS
        "messages",
        "webhook_events",
        "whatsapp_channel",
        "instagram_channel",
        "email_channel",
        "channels_config",
        "shopify_config",
        "customers",
        "users",
        "conversations",
        "contacts",
        "inboxes",
        "accounts",
        "contact_identities",
        "_prisma_migrations"
      CASCADE
    `);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ChannelType" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ConversationStatus" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "MessageDirection" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "MessageStatus" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "ContentType" CASCADE`);

    const left = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY(ARRAY[
          'messages','webhook_events','whatsapp_channel','instagram_channel','email_channel',
          'channels_config','shopify_config','customers','users','conversations','contacts',
          'inboxes','accounts','contact_identities','_prisma_migrations'
        ])
    `);
    console.log("[wipe] remaining CEP tables:", left.length ? left.map((r) => r.table_name) : "none");
    console.log("[wipe] done (schema not recreated — restart API or run npm run db:deploy)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[wipe] FAILED", err);
  process.exit(1);
});
