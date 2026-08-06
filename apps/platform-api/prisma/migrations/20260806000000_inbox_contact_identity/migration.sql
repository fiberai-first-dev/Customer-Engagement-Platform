-- Chatwoot-style refactor: Inbox + ContactIdentity
-- Safe to run against either:
--   A) init migration (already had inboxes, conversations.inbox_id, contact.identifiers)
--   B) account-centric schema (whatsapp_config on accounts, no inboxes / no inbox_id)

-- ---------------------------------------------------------------------------
-- 1. Ensure inboxes table exists
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "inboxes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "channel_config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "inboxes"
    ADD CONSTRAINT "inboxes_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "inboxes_account_id_idx" ON "inboxes"("account_id");
CREATE INDEX IF NOT EXISTS "inboxes_channel_type_idx" ON "inboxes"("channel_type");
CREATE INDEX IF NOT EXISTS "inboxes_account_id_channel_type_idx" ON "inboxes"("account_id", "channel_type");

-- ---------------------------------------------------------------------------
-- 2. Migrate Account channel configs → Inbox rows (if account columns exist)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'whatsapp_config'
  ) THEN
    INSERT INTO "inboxes" ("id", "account_id", "name", "channel_type", "channel_config", "enabled", "created_at", "updated_at")
    SELECT
      'inbox_wa_' || a.id,
      a.id,
      'WhatsApp',
      'whatsapp'::"ChannelType",
      COALESCE(a.whatsapp_config, '{}'::jsonb),
      COALESCE(a.whatsapp_enabled, false),
      NOW(),
      NOW()
    FROM accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM inboxes i WHERE i.account_id = a.id AND i.channel_type = 'whatsapp'
    );

    INSERT INTO "inboxes" ("id", "account_id", "name", "channel_type", "channel_config", "enabled", "created_at", "updated_at")
    SELECT
      'inbox_ig_' || a.id,
      a.id,
      'Instagram',
      'instagram'::"ChannelType",
      COALESCE(a.instagram_config, '{}'::jsonb),
      COALESCE(a.instagram_enabled, false),
      NOW(),
      NOW()
    FROM accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM inboxes i WHERE i.account_id = a.id AND i.channel_type = 'instagram'
    );

    INSERT INTO "inboxes" ("id", "account_id", "name", "channel_type", "channel_config", "enabled", "created_at", "updated_at")
    SELECT
      'inbox_em_' || a.id,
      a.id,
      'Email',
      'email'::"ChannelType",
      COALESCE(a.email_config, '{}'::jsonb),
      COALESCE(a.email_enabled, false),
      NOW(),
      NOW()
    FROM accounts a
    WHERE NOT EXISTS (
      SELECT 1 FROM inboxes i WHERE i.account_id = a.id AND i.channel_type = 'email'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Conversations: ensure inbox_id, backfill from channel_type, drop channel_type
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "inbox_id" TEXT;

-- Backfill inbox_id from channel_type when that column still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'channel_type'
  ) THEN
    EXECUTE $sql$
      UPDATE conversations c
      SET inbox_id = i.id
      FROM inboxes i
      WHERE c.inbox_id IS NULL
        AND i.account_id = c.account_id
        AND i.channel_type = c.channel_type
    $sql$;
  END IF;
END $$;

-- Fallback: any remaining null inbox_id → first inbox for account
UPDATE "conversations" c
SET "inbox_id" = (
  SELECT i.id FROM inboxes i WHERE i.account_id = c.account_id ORDER BY i.created_at ASC LIMIT 1
)
WHERE c.inbox_id IS NULL;

-- Drop old unique on (account_id, channel_type, external_thread_id) if present
DROP INDEX IF EXISTS "conversations_account_id_channel_type_external_thread_id_key";

-- Drop conversations.channel_type
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "channel_type";

-- Enforce inbox_id NOT NULL (only if all rows filled)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM conversations WHERE inbox_id IS NULL) THEN
    ALTER TABLE "conversations" ALTER COLUMN "inbox_id" SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "conversations"
    ADD CONSTRAINT "conversations_inbox_id_fkey"
    FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_inbox_id_external_thread_id_key"
  ON "conversations"("inbox_id", "external_thread_id");
CREATE INDEX IF NOT EXISTS "conversations_inbox_id_idx" ON "conversations"("inbox_id");
CREATE INDEX IF NOT EXISTS "conversations_account_id_status_idx" ON "conversations"("account_id", "status");
CREATE INDEX IF NOT EXISTS "conversations_account_id_last_message_at_idx" ON "conversations"("account_id", "last_message_at");
CREATE INDEX IF NOT EXISTS "conversations_contact_id_idx" ON "conversations"("contact_id");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- ---------------------------------------------------------------------------
-- 4. ContactIdentity + migrate from contacts.identifiers JSON
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "contact_identities" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "contact_identities"
    ADD CONSTRAINT "contact_identities_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "contact_identities_account_id_channel_external_id_key"
  ON "contact_identities"("account_id", "channel", "external_id");
CREATE INDEX IF NOT EXISTS "contact_identities_contact_id_idx" ON "contact_identities"("contact_id");
CREATE INDEX IF NOT EXISTS "contact_identities_channel_external_id_idx" ON "contact_identities"("channel", "external_id");

-- Expand identifiers JSON → rows (only if column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'identifiers'
  ) THEN
    INSERT INTO contact_identities (id, contact_id, account_id, channel, external_id, metadata, created_at, updated_at)
    SELECT
      'cid_' || c.id || '_' || kv.key,
      c.id,
      c.account_id,
      kv.key::"ChannelType",
      kv.value,
      '{}'::jsonb,
      NOW(),
      NOW()
    FROM contacts c
    CROSS JOIN LATERAL jsonb_each_text(c.identifiers) AS kv(key, value)
    WHERE kv.key IN ('whatsapp', 'instagram', 'email')
      AND kv.value IS NOT NULL
      AND kv.value <> ''
    ON CONFLICT (account_id, channel, external_id) DO NOTHING;

    ALTER TABLE "contacts" DROP COLUMN "identifiers";
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Webhook events (create if missing, or migrate account_id → inbox_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL,
    "inbox_id" TEXT,
    "channel" "ChannelType" NOT NULL,
    "event_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "inbox_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'webhook_events' AND column_name = 'account_id'
  ) THEN
    EXECUTE $sql$
      UPDATE webhook_events w
      SET inbox_id = i.id
      FROM inboxes i
      WHERE w.inbox_id IS NULL
        AND i.account_id = w.account_id
        AND i.channel_type = w.channel
    $sql$;
  END IF;
END $$;

-- Drop old unique / column
DROP INDEX IF EXISTS "webhook_events_account_id_event_key_key";
ALTER TABLE "webhook_events" DROP COLUMN IF EXISTS "account_id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM webhook_events) AND NOT EXISTS (SELECT 1 FROM webhook_events WHERE inbox_id IS NULL) THEN
    ALTER TABLE "webhook_events" ALTER COLUMN "inbox_id" SET NOT NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM webhook_events) THEN
    ALTER TABLE "webhook_events" ALTER COLUMN "inbox_id" SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "webhook_events"
    ADD CONSTRAINT "webhook_events_inbox_id_fkey"
    FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_inbox_id_event_key_key"
  ON "webhook_events"("inbox_id", "event_key");
CREATE INDEX IF NOT EXISTS "webhook_events_channel_created_at_idx" ON "webhook_events"("channel", "created_at");

-- ---------------------------------------------------------------------------
-- 6. Drop Account channel columns
-- ---------------------------------------------------------------------------
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "whatsapp_config";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "whatsapp_enabled";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "instagram_config";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "instagram_enabled";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "email_config";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "email_enabled";
