-- Multiple emails/phones per contact (JSON arrays). Primary email/phone kept in sync as first item.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "emails" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phones" JSONB NOT NULL DEFAULT '[]';

UPDATE "contacts"
SET "emails" = CASE
  WHEN "email" IS NOT NULL AND btrim("email") <> '' THEN jsonb_build_array(btrim("email"))
  ELSE '[]'::jsonb
END
WHERE "emails" = '[]'::jsonb OR "emails" IS NULL;

UPDATE "contacts"
SET "phones" = CASE
  WHEN "phone" IS NOT NULL AND btrim("phone") <> '' THEN jsonb_build_array(btrim("phone"))
  ELSE '[]'::jsonb
END
WHERE "phones" = '[]'::jsonb OR "phones" IS NULL;
