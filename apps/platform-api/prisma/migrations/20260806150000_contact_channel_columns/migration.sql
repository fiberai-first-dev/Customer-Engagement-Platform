-- Flatten contact_identities into contacts channel columns
-- Safe / idempotent for DBs that already have ContactIdentity or plain contacts

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp_id" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp_details" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "instagram_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "instagram_id" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "instagram_details" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_id" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "email_details" JSONB NOT NULL DEFAULT '{}';

-- Migrate identity rows → contact columns (if identity table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_identities'
  ) THEN
    UPDATE contacts c
    SET
      whatsapp_enabled = true,
      whatsapp_id = COALESCE(c.whatsapp_id, i.external_id),
      whatsapp_details = CASE
        WHEN i.metadata IS NULL OR i.metadata = '{}'::jsonb THEN c.whatsapp_details
        ELSE i.metadata
      END,
      phone = COALESCE(c.phone, i.external_id)
    FROM contact_identities i
    WHERE i.contact_id = c.id AND i.channel = 'whatsapp';

    UPDATE contacts c
    SET
      instagram_enabled = true,
      instagram_id = COALESCE(c.instagram_id, i.external_id),
      instagram_details = CASE
        WHEN i.metadata IS NULL OR i.metadata = '{}'::jsonb THEN c.instagram_details
        ELSE i.metadata
      END
    FROM contact_identities i
    WHERE i.contact_id = c.id AND i.channel = 'instagram';

    UPDATE contacts c
    SET
      email_enabled = true,
      email_id = COALESCE(c.email_id, i.external_id),
      email = COALESCE(c.email, i.external_id),
      email_details = CASE
        WHEN i.metadata IS NULL OR i.metadata = '{}'::jsonb THEN c.email_details
        ELSE i.metadata
      END
    FROM contact_identities i
    WHERE i.contact_id = c.id AND i.channel = 'email';

    DROP TABLE IF EXISTS "contact_identities";
  END IF;
END $$;

-- Backfill enabled flags from existing email/phone when ids missing
UPDATE "contacts"
SET
  whatsapp_id = COALESCE(whatsapp_id, phone),
  whatsapp_enabled = CASE WHEN COALESCE(whatsapp_id, phone) IS NOT NULL THEN true ELSE whatsapp_enabled END
WHERE phone IS NOT NULL AND whatsapp_id IS NULL;

UPDATE "contacts"
SET
  email_id = COALESCE(email_id, email),
  email_enabled = CASE WHEN COALESCE(email_id, email) IS NOT NULL THEN true ELSE email_enabled END
WHERE email IS NOT NULL AND email_id IS NULL;

CREATE INDEX IF NOT EXISTS "contacts_account_id_whatsapp_id_idx" ON "contacts"("account_id", "whatsapp_id");
CREATE INDEX IF NOT EXISTS "contacts_account_id_instagram_id_idx" ON "contacts"("account_id", "instagram_id");
CREATE INDEX IF NOT EXISTS "contacts_account_id_email_id_idx" ON "contacts"("account_id", "email_id");
