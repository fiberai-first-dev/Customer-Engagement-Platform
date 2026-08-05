import { ulid } from "ulid";
import type { ChannelType, ContentType, MessageStatus, Prisma } from "../generated/client/index.js";
import { prisma } from "../db.js";
import {
  assertChannelConfig,
  getChannelAdapter,
  type NormalizedInboundMessage,
  type ChannelConfig,
} from "@cep/channels";

function asIdentifiers(value: Prisma.JsonValue): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string>;
  }
  return {};
}

function mapContentType(value: NormalizedInboundMessage["contentType"]): ContentType {
  return value;
}

function mapSendStatus(status: string): MessageStatus {
  if (status === "mocked") return "mocked";
  if (status === "queued") return "queued";
  if (status === "failed") return "failed";
  return "sent";
}

export async function findOrCreateContact(input: {
  accountId: string;
  channelType: ChannelType;
  inbound: NormalizedInboundMessage;
}) {
  const { accountId, channelType, inbound } = input;
  const senderKey = inbound.senderId;

  const existing = await prisma.contact.findMany({
    where: { accountId },
    take: 500,
  });

  const matched = existing.find((c) => {
    const ids = asIdentifiers(c.identifiers);
    if (ids[channelType] === senderKey) return true;
    if (inbound.senderEmail && c.email === inbound.senderEmail) return true;
    if (inbound.senderPhone && c.phone === inbound.senderPhone) return true;
    return false;
  });

  if (matched) {
    const ids = asIdentifiers(matched.identifiers);
    ids[channelType] = senderKey;
    return prisma.contact.update({
      where: { id: matched.id },
      data: {
        name: matched.name ?? inbound.senderName ?? undefined,
        email: matched.email ?? inbound.senderEmail ?? undefined,
        phone: matched.phone ?? inbound.senderPhone ?? undefined,
        identifiers: ids,
      },
    });
  }

  return prisma.contact.create({
    data: {
      id: ulid(),
      accountId,
      name: inbound.senderName ?? inbound.senderEmail ?? inbound.senderPhone ?? senderKey,
      email: inbound.senderEmail,
      phone: inbound.senderPhone,
      identifiers: { [channelType]: senderKey },
    },
  });
}

export async function findOrCreateConversation(input: {
  accountId: string;
  inboxId: string;
  contactId: string;
  channelType: ChannelType;
  externalThreadId: string;
}) {
  const existing = await prisma.conversation.findUnique({
    where: {
      inboxId_externalThreadId: {
        inboxId: input.inboxId,
        externalThreadId: input.externalThreadId,
      },
    },
  });
  if (existing) {
    if (existing.status === "resolved") {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { status: "open" },
      });
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      id: ulid(),
      accountId: input.accountId,
      inboxId: input.inboxId,
      contactId: input.contactId,
      channelType: input.channelType,
      externalThreadId: input.externalThreadId,
      status: "open",
    },
  });
}

export async function ingestInboundMessages(input: {
  inboxId: string;
  payload: unknown;
  eventKey?: string;
}) {
  const inbox = await prisma.inbox.findUnique({ where: { id: input.inboxId } });
  if (!inbox || !inbox.enabled) {
    throw new Error("Inbox not found or disabled");
  }

  const adapter = getChannelAdapter(inbox.channelType);
  const config = assertChannelConfig(inbox.channelType, inbox.channelConfig);
  const inboundMessages = adapter.parseInbound(config, input.payload);

  const eventKey =
    input.eventKey ??
    (inboundMessages[0]?.externalId
      ? `batch:${inboundMessages.map((m) => m.externalId).join(",")}`
      : `raw:${ulid()}`);

  try {
    await prisma.webhookEvent.create({
      data: {
        id: ulid(),
        inboxId: inbox.id,
        channel: inbox.channelType,
        eventKey,
        payload: input.payload as Prisma.InputJsonValue,
        processed: false,
      },
    });
  } catch {
    // duplicate webhook delivery — ignore
    return { created: 0, duplicates: true, messages: [] as unknown[] };
  }

  const created = [];
  for (const inbound of inboundMessages) {
    const contact = await findOrCreateContact({
      accountId: inbox.accountId,
      channelType: inbox.channelType,
      inbound,
    });
    const conversation = await findOrCreateConversation({
      accountId: inbox.accountId,
      inboxId: inbox.id,
      contactId: contact.id,
      channelType: inbox.channelType,
      externalThreadId: inbound.externalThreadId ?? inbound.senderId,
    });

    // Sort conversations by when CEP received the event (provider sample timestamps
    // like Meta's dashboard test use stale dates that bury the thread).
    const receivedAt = new Date();

    try {
      const message = await prisma.message.create({
        data: {
          id: ulid(),
          conversationId: conversation.id,
          direction: "incoming",
          content: inbound.content,
          contentType: mapContentType(inbound.contentType),
          subject: inbound.subject,
          externalId: inbound.externalId,
          status: "received",
          rawPayload: inbound.raw as Prisma.InputJsonValue,
          createdAt: receivedAt,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: receivedAt, status: "open" },
      });
      created.push(message);
    } catch {
      // duplicate message external id
    }
  }

  await prisma.webhookEvent.updateMany({
    where: { inboxId: inbox.id, eventKey },
    data: { processed: true },
  });

  return { created: created.length, duplicates: false, messages: created };
}

export async function sendConversationMessage(input: {
  conversationId: string;
  content: string;
  subject?: string;
}) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: { inbox: true, contact: true },
  });
  if (!conversation) throw new Error("Conversation not found");

  const adapter = getChannelAdapter(conversation.channelType);
  const config = assertChannelConfig(
    conversation.channelType,
    conversation.inbox.channelConfig,
  ) as ChannelConfig;

  const identifiers = asIdentifiers(conversation.contact.identifiers);
  const to =
    identifiers[conversation.channelType] ??
    conversation.contact.phone ??
    conversation.contact.email ??
    conversation.externalThreadId;

  if (!to) throw new Error("No recipient address on contact");

  const result = await adapter.sendMessage(config, {
    to,
    content: input.content,
    subject: input.subject,
  });

  const message = await prisma.message.create({
    data: {
      id: ulid(),
      conversationId: conversation.id,
      direction: "outgoing",
      content: input.content,
      contentType: "text",
      subject: input.subject,
      externalId: result.externalId ?? `local_${ulid()}`,
      status: mapSendStatus(result.status),
      rawPayload: (result.raw ?? { error: result.error }) as Prisma.InputJsonValue,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, status: "open" },
  });

  return { message, result };
}

export function redactConfig(config: Prisma.JsonValue): Prisma.JsonValue {
  if (!config || typeof config !== "object" || Array.isArray(config)) return config;
  const clone = { ...(config as Record<string, unknown>) };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("pass") ||
      lower.includes("password")
    ) {
      if (typeof clone[key] === "string" && clone[key]) {
        clone[key] = "***";
      }
    }
  }
  return clone;
}

/** Merge patch into existing config; ignore redacted placeholders so Save won't wipe secrets. */
export function mergeChannelConfig(
  existing: Prisma.JsonValue,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === "***") continue;
    base[key] = value;
  }
  return base as Prisma.InputJsonValue;
}
