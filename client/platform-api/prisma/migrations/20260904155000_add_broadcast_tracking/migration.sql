-- Add tracking fields to broadcast_recipients
ALTER TABLE "broadcast_recipients" ADD COLUMN "message_id" TEXT;
ALTER TABLE "broadcast_recipients" ADD COLUMN "delivered_at" TIMESTAMP(3);
ALTER TABLE "broadcast_recipients" ADD COLUMN "read_at" TIMESTAMP(3);
CREATE INDEX "broadcast_recipients_message_id_idx" ON "broadcast_recipients"("message_id");
