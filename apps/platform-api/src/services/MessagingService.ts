import { ulid } from "ulid";
import type { ChannelType, ContentType, MessageStatus, Prisma } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import {
  getChannelAdapter,
  getEmailAdapter,
  resolveChannelConfig,
  type NormalizedInboundMessage,
  type ChannelConfig,
} from "../adapters/shared/index.js";
import { extractEmailAddress } from "../adapters/email/index.js";

/** Resolve outbound recipient from flattened contact channel columns. */
async function resolveOutboundRecipient(input: {
  accountId: string;
  contactId: string;
  channelType: ChannelType;
  contact: {
    phone: string | null;
    email: string | null;
    whatsappId?: string | null;
    instagramId?: string | null;
    emailId?: string | null;
  };
  externalThreadId: string | null;
}): Promise<string> {
  if (input.channelType === "whatsapp") {
    const to = input.contact.whatsappId ?? input.contact.phone ?? input.externalThreadId;
    if (!to) throw new Error("No WhatsApp recipient on contact");
    return to;
  }

  if (input.channelType === "instagram") {
    const to = input.contact.instagramId ?? input.externalThreadId;
    if (!to) throw new Error("No Instagram recipient on contact");
    return to;
  }

  const raw = input.contact.emailId ?? input.contact.email ?? input.externalThreadId;
  if (!raw) throw new Error("No email recipient on contact");
  return extractEmailAddress(raw);
}

function mapContentType(value: NormalizedInboundMessage["contentType"]): ContentType {
  return value;
}

function mapSendStatus(status: string): MessageStatus {
  if (status === "queued") return "queued";
  if (status === "failed") return "failed";
  return "sent";
}

type ContactChannelRow = {
  id: string;
  accountId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsappEnabled: boolean;
  whatsappId: string | null;
  whatsappDetails: Prisma.JsonValue;
  instagramEnabled: boolean;
  instagramId: string | null;
  instagramDetails: Prisma.JsonValue;
  emailEnabled: boolean;
  emailId: string | null;
  emailDetails: Prisma.JsonValue;
};

/** API-compat identity rows derived from contact columns. */
export function contactToIdentities(contact: ContactChannelRow): Array<{
  id: string;
  channel: ChannelType;
  externalId: string;
  metadata: Prisma.JsonValue;
  enabled: boolean;
}> {
  const out: Array<{
    id: string;
    channel: ChannelType;
    externalId: string;
    metadata: Prisma.JsonValue;
    enabled: boolean;
  }> = [];
  if (contact.whatsappId) {
    out.push({
      id: `${contact.id}:whatsapp`,
      channel: "whatsapp",
      externalId: contact.whatsappId,
      metadata: contact.whatsappDetails,
      enabled: contact.whatsappEnabled,
    });
  }
  if (contact.instagramId) {
    out.push({
      id: `${contact.id}:instagram`,
      channel: "instagram",
      externalId: contact.instagramId,
      metadata: contact.instagramDetails,
      enabled: contact.instagramEnabled,
    });
  }
  if (contact.emailId || contact.email) {
    out.push({
      id: `${contact.id}:email`,
      channel: "email",
      externalId: contact.emailId || contact.email!,
      metadata: contact.emailDetails,
      enabled: contact.emailEnabled,
    });
  }
  return out;
}

/** Enable/update a channel on an existing contact (same-user merge). */
export async function enableContactChannel(input: {
  contactId: string;
  channelType: ChannelType;
  externalId: string;
  details?: Prisma.InputJsonValue;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}) {
  const details = input.details ?? {};
  if (input.channelType === "whatsapp") {
    return prisma.contact.update({
      where: { id: input.contactId },
      data: {
        whatsappEnabled: true,
        whatsappId: input.externalId,
        whatsappDetails: details,
        phone: input.phone ?? input.externalId,
        name: input.name ?? undefined,
        email: input.email ?? undefined,
      },
    });
  }
  if (input.channelType === "instagram") {
    const existing = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { name: true },
    });
    const nameLooksLikeIgsid =
      !!existing?.name && /^\d{10,}$/.test(existing.name.trim());
    return prisma.contact.update({
      where: { id: input.contactId },
      data: {
        instagramEnabled: true,
        instagramId: input.externalId,
        instagramDetails: details,
        // Replace numeric IGSID placeholder when we learn @username
        name:
          input.name && (!existing?.name || nameLooksLikeIgsid)
            ? input.name
            : input.name ?? undefined,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
      },
    });
  }
  return prisma.contact.update({
    where: { id: input.contactId },
    data: {
      emailEnabled: true,
      emailId: input.externalId,
      emailDetails: details,
      email: input.email ?? input.externalId,
      name: input.name ?? undefined,
      phone: input.phone ?? undefined,
    },
  });
}

export async function findOrCreateContact(input: {
  accountId: string;
  channelType: ChannelType;
  inbound: NormalizedInboundMessage;
}) {
  const { accountId, channelType, inbound } = input;
  const senderKey =
    channelType === "email"
      ? extractEmailAddress(inbound.senderId)
      : inbound.senderId;
  const details = {
    senderName: inbound.senderName ?? null,
  } as Prisma.InputJsonValue;

  const byChannel =
    channelType === "whatsapp"
      ? await prisma.contact.findFirst({ where: { accountId, whatsappId: senderKey } })
      : channelType === "instagram"
        ? await prisma.contact.findFirst({ where: { accountId, instagramId: senderKey } })
        : await prisma.contact.findFirst({
            where: {
              accountId,
              OR: [{ emailId: senderKey }, { email: senderKey }],
            },
          });

  if (byChannel) {
    const nameLooksLikeIgsid =
      !!byChannel.name && /^\d{10,}$/.test(byChannel.name.trim());
    return enableContactChannel({
      contactId: byChannel.id,
      channelType,
      externalId: senderKey,
      details,
      name: nameLooksLikeIgsid
        ? inbound.senderName ?? byChannel.name
        : byChannel.name ?? inbound.senderName,
      email: byChannel.email ?? (inbound.senderEmail ? extractEmailAddress(inbound.senderEmail) : null),
      phone: byChannel.phone ?? inbound.senderPhone,
    });
  }

  // Soft-merge: same email/phone on another channel within the account
  let matched =
    (inbound.senderEmail &&
      (await prisma.contact.findFirst({
        where: {
          accountId,
          OR: [
            { email: extractEmailAddress(inbound.senderEmail) },
            { emailId: extractEmailAddress(inbound.senderEmail) },
          ],
        },
      }))) ||
    (inbound.senderPhone &&
      (await prisma.contact.findFirst({
        where: {
          accountId,
          OR: [{ phone: inbound.senderPhone }, { whatsappId: inbound.senderPhone.replace(/^\+/, "") }],
        },
      })));

  if (matched) {
    return enableContactChannel({
      contactId: matched.id,
      channelType,
      externalId: senderKey,
      details,
      name: matched.name ?? inbound.senderName,
      email: matched.email ?? (inbound.senderEmail ? extractEmailAddress(inbound.senderEmail) : null),
      phone: matched.phone ?? inbound.senderPhone,
    });
  }

  const base = {
    id: ulid(),
    accountId,
    name: inbound.senderName ?? inbound.senderEmail ?? inbound.senderPhone ?? senderKey,
    email: inbound.senderEmail ? extractEmailAddress(inbound.senderEmail) : undefined,
    phone: inbound.senderPhone,
  };

  if (channelType === "whatsapp") {
    return prisma.contact.create({
      data: {
        ...base,
        phone: inbound.senderPhone ?? senderKey,
        whatsappEnabled: true,
        whatsappId: senderKey,
        whatsappDetails: details,
      },
    });
  }
  if (channelType === "instagram") {
    return prisma.contact.create({
      data: {
        ...base,
        instagramEnabled: true,
        instagramId: senderKey,
        instagramDetails: details,
      },
    });
  }
  return prisma.contact.create({
    data: {
      ...base,
      email: extractEmailAddress(senderKey),
      emailEnabled: true,
      emailId: senderKey,
      emailDetails: details,
    },
  });
}

export async function findOrCreateConversation(input: {
  accountId: string;
  inboxId: string;
  contactId: string;
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

  const adapter =
    inbox.channelType === "email"
      ? getEmailAdapter(inbox.channelConfig)
      : getChannelAdapter(inbox.channelType);
  const config = resolveChannelConfig(inbox.channelType, inbox.channelConfig);
  let inboundMessages = adapter.parseInbound(config, input.payload);

  // Instagram webhooks only send IGSID — resolve @username for contact.name
  if (inbox.channelType === "instagram" && inboundMessages.length) {
    const { enrichInstagramInboundNames } = await import(
      "../adapters/instagram/index.js"
    );
    inboundMessages = await enrichInstagramInboundNames(
      config as import("../adapters/shared/types.js").InstagramChannelConfig,
      inboundMessages,
    );
  }

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
      externalThreadId: inbound.externalThreadId ?? inbound.senderId,
    });

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

  const channelType = conversation.inbox.channelType;
  const adapter =
    channelType === "email"
      ? getEmailAdapter(conversation.inbox.channelConfig)
      : getChannelAdapter(channelType);
  const config = resolveChannelConfig(
    channelType,
    conversation.inbox.channelConfig,
  ) as ChannelConfig;

  const to = await resolveOutboundRecipient({
    accountId: conversation.accountId,
    contactId: conversation.contactId,
    channelType,
    contact: conversation.contact,
    externalThreadId: conversation.externalThreadId,
  });

  const lastInbound = await prisma.message.findFirst({
    where: { conversationId: conversation.id, direction: "incoming" },
    orderBy: { createdAt: "desc" },
  });

  let subject = input.subject;
  if (channelType === "email" && !subject) {
    const inboundSubject = lastInbound?.subject?.trim();
    if (inboundSubject) {
      subject = inboundSubject.toLowerCase().startsWith("re:")
        ? inboundSubject
        : `Re: ${inboundSubject}`;
    }
  }

  const result = await adapter.sendMessage(config, {
    to,
    content: input.content,
    subject,
    threadId: conversation.externalThreadId ?? undefined,
    replyToExternalId: lastInbound?.externalId ?? undefined,
  });

  const message = await prisma.message.create({
    data: {
      id: ulid(),
      conversationId: conversation.id,
      direction: "outgoing",
      content: input.content,
      contentType: "text",
      subject,
      externalId: result.externalId ?? `local_${ulid()}`,
      status: mapSendStatus(result.status),
      rawPayload: {
        ...(result.raw && typeof result.raw === "object" && !Array.isArray(result.raw)
          ? (result.raw as Record<string, unknown>)
          : {}),
        error: result.error,
        channelType,
        to,
      } as Prisma.InputJsonValue,
    },
  });

  // Agent reply closes the channel (resolved). Customer inbound re-opens it.
  // Failed sends do not mark resolved — agent still needs to follow up.
  const nextStatus =
    result.status === "failed" ? conversation.status : ("resolved" as const);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: message.createdAt, status: nextStatus },
  });

  return { message, result };
}

/** Legacy-friendly identifiers map from identity-like rows or contact columns. */
export function identitiesToMap(
  identities: { channel: ChannelType; externalId: string }[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const identity of identities) {
    map[identity.channel] = identity.externalId;
  }
  return map;
}

export function contactIdentifiersFromRow(contact: ContactChannelRow): Record<string, string> {
  return identitiesToMap(
    contactToIdentities(contact).map((i) => ({
      channel: i.channel,
      externalId: i.externalId,
    })),
  );
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
  return clone as Prisma.JsonValue;
}

export function mergeChannelConfig(
  existing: Prisma.JsonValue,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  for (const [key, value] of Object.entries(patch)) {
    if (key === "mock") continue;
    if (value === "***") continue;
    base[key] = value;
  }
  delete base.mock;
  return base as Prisma.InputJsonValue;
}
