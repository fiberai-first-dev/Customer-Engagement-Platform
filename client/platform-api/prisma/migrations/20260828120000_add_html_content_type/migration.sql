-- Allow Gmail HTML bodies to be stored as rendered email content.
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'html';

-- Reclassify historical email rows whose stored body is already HTML.
UPDATE "messages"
SET "content_type" = 'html'
WHERE "channel_type" = 'email'
  AND "content_type" = 'text'
  AND "content" ~* '<(html|body|div|p|table|blockquote|br|a)([[:space:]>])';
