-- WhatsApp numbers replace phone/phones.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "whatsapp_ids" JSONB NOT NULL DEFAULT '[]';

-- Seed arrays from existing whatsapp_id
UPDATE "contacts"
SET "whatsapp_ids" = jsonb_build_array(btrim("whatsapp_id"))
WHERE ("whatsapp_ids" = '[]'::jsonb OR "whatsapp_ids" IS NULL)
  AND "whatsapp_id" IS NOT NULL
  AND btrim("whatsapp_id") <> '';

-- Merge legacy phone into whatsapp_id / whatsapp_ids when WA empty
UPDATE "contacts"
SET
  "whatsapp_id" = COALESCE("whatsapp_id", NULLIF(btrim("phone"), '')),
  "whatsapp_ids" = CASE
    WHEN "whatsapp_ids" = '[]'::jsonb OR "whatsapp_ids" IS NULL
      THEN jsonb_build_array(btrim("phone"))
    ELSE "whatsapp_ids" || jsonb_build_array(btrim("phone"))
  END
WHERE "phone" IS NOT NULL
  AND btrim("phone") <> ''
  AND (
    "whatsapp_id" IS NULL
    OR btrim("whatsapp_id") = ''
    OR NOT ("whatsapp_ids" ? btrim("phone"))
  );

DROP INDEX IF EXISTS "contacts_phone_idx";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "phones";
