-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('whatsapp', 'instagram', 'email');
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'resolved');
CREATE TYPE "MessageDirection" AS ENUM ('incoming', 'outgoing');
CREATE TYPE "MessageStatus" AS ENUM ('received', 'queued', 'sent', 'delivered', 'failed', 'mocked');
CREATE TYPE "ContentType" AS ENUM ('text', 'image', 'file', 'audio', 'video', 'unknown');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inboxes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "channel_config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "inbox_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "channel_type" "ChannelType" NOT NULL,
    "external_thread_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "content_type" "ContentType" NOT NULL DEFAULT 'text',
    "subject" TEXT,
    "external_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'received',
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "inbox_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "event_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "inboxes_account_id_idx" ON "inboxes"("account_id");
CREATE INDEX "inboxes_channel_type_idx" ON "inboxes"("channel_type");
CREATE INDEX "contacts_account_id_idx" ON "contacts"("account_id");
CREATE INDEX "contacts_email_idx" ON "contacts"("email");
CREATE INDEX "contacts_phone_idx" ON "contacts"("phone");
CREATE UNIQUE INDEX "conversations_inbox_id_external_thread_id_key" ON "conversations"("inbox_id", "external_thread_id");
CREATE INDEX "conversations_account_id_status_idx" ON "conversations"("account_id", "status");
CREATE INDEX "conversations_inbox_id_idx" ON "conversations"("inbox_id");
CREATE INDEX "conversations_contact_id_idx" ON "conversations"("contact_id");
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");
CREATE UNIQUE INDEX "messages_conversation_id_external_id_key" ON "messages"("conversation_id", "external_id");
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");
CREATE UNIQUE INDEX "webhook_events_inbox_id_event_key_key" ON "webhook_events"("inbox_id", "event_key");
CREATE INDEX "webhook_events_channel_created_at_idx" ON "webhook_events"("channel", "created_at");

-- FKs
ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
