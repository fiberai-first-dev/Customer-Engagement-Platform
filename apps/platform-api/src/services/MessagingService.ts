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
    email: string | null;
    whatsappId?: string | null;
    instagramId?: string | null;
    emailId?: string | null;
  };
  externalThreadId: string | null;
}): Promise<string> {
  if (input.channelType === "whatsapp") {
    const to = input.contact.whatsappId ?? input.externalThreadId;
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
  emails?: Prisma.JsonValue;
  whatsappEnabled: boolean;
  whatsappId: string | null;
  whatsappIds?: Prisma.JsonValue;
  whatsappDetails: Prisma.JsonValue;
  instagramEnabled: boolean;
  instagramId: string | null;
  instagramDetails: Prisma.JsonValue;
  emailEnabled: boolean;
  emailId: string | null;
  emailDetails: Prisma.JsonValue;
};

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Normalize WhatsApp numbers for stable match/storage (digits only, no leading +). */
export function normalizeWhatsAppId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits || null;
}

export function uniqStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

export function uniqWhatsAppIds(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = normalizeWhatsAppId(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function withPrimaryAndLists(input: {
  emails?: string[] | null;
  whatsappIds?: string[] | null;
  email?: string | null;
  whatsappId?: string | null;
}): {
  email: string | null;
  whatsappId: string | null;
  emails: string[];
  whatsappIds: string[];
} {
  const emails = uniqStrings([...(input.emails ?? []), input.email]);
  const whatsappIds = uniqWhatsAppIds([...(input.whatsappIds ?? []), input.whatsappId]);
  return {
    emails,
    whatsappIds,
    email: emails[0] ?? null,
    whatsappId: whatsappIds[0] ?? null,
  };
}

function appendToList(existing: unknown, ...extra: Array<string | null | undefined>): string[] {
  return uniqStrings([...asStringList(existing), ...extra]);
}

function appendWhatsAppIds(existing: unknown, ...extra: Array<string | null | undefined>): string[] {
  return uniqWhatsAppIds([...asStringList(existing), ...extra]);
}

function whatsappMatchOr(accountId: string, ...candidates: Array<string | null | undefined>) {
  const ids = uniqWhatsAppIds(candidates);
  if (!ids.length) return null;
  return {
    accountId,
    OR: ids.flatMap((id) => [
      { whatsappId: id },
      { whatsappIds: { array_contains: id } },
      { whatsappId: `+${id}` },
      { whatsappIds: { array_contains: `+${id}` } },
    ]),
  };
}

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

  const waIds = uniqWhatsAppIds([
    ...asStringList(contact.whatsappIds),
    contact.whatsappId,
  ]);
  for (const [idx, externalId] of waIds.entries()) {
    out.push({
      id: `${contact.id}:whatsapp:${idx}`,
      channel: "whatsapp",
      externalId,
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

  const emailIds = uniqStrings([
    ...asStringList(contact.emails),
    contact.emailId,
    contact.email,
  ]);
  for (const [idx, externalId] of emailIds.entries()) {
    out.push({
      id: `${contact.id}:email:${idx}`,
      channel: "email",
      externalId,
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
  const existing = await prisma.contact.findUnique({ where: { id: input.contactId } });
  if (!existing) throw new Error("Contact not found");

  const details = input.details ?? {};
  if (input.channelType === "whatsapp") {
    const whatsappIds = appendWhatsAppIds(
      existing.whatsappIds,
      existing.whatsappId,
      input.phone,
      input.externalId,
    );
    return prisma.contact.update({
      where: { id: input.contactId },
      data: {
        whatsappEnabled: true,
        whatsappId: whatsappIds[0] ?? normalizeWhatsAppId(input.externalId),
        whatsappIds,
        whatsappDetails: details,
        name: input.name ?? undefined,
        email: input.email ?? undefined,
        emails: input.email
          ? appendToList(existing.emails, existing.email, input.email)
          : undefined,
      },
    });
  }
  if (input.channelType === "instagram") {
    const nameLooksLikeIgsid =
      !!existing.name && /^\d{10,}$/.test(existing.name.trim());
    return prisma.contact.update({
      where: { id: input.contactId },
      data: {
        instagramEnabled: true,
        instagramId: input.externalId,
        instagramDetails: details,
        name:
          input.name && (!existing.name || nameLooksLikeIgsid)
            ? input.name
            : input.name ?? undefined,
        email: input.email ?? undefined,
        emails: input.email
          ? appendToList(existing.emails, existing.email, input.email)
          : undefined,
      },
    });
  }
  const emails = appendToList(
    existing.emails,
    existing.email,
    input.email,
    input.externalId,
  );
  return prisma.contact.update({
    where: { id: input.contactId },
    data: {
      emailEnabled: true,
      emailId: input.externalId,
      emailDetails: details,
      emails,
      email: emails[0] ?? input.externalId,
      name: input.name ?? undefined,
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
      : channelType === "whatsapp"
        ? normalizeWhatsAppId(inbound.senderId) ?? inbound.senderId
        : inbound.senderId;
  const details = {
    senderName: inbound.senderName ?? null,
  } as Prisma.InputJsonValue;

  const waLookup = whatsappMatchOr(
    accountId,
    senderKey,
    inbound.senderId,
    inbound.senderPhone,
  );

  const byChannel =
    channelType === "whatsapp" && waLookup
      ? await prisma.contact.findFirst({ where: waLookup })
      : channelType === "instagram"
        ? await prisma.contact.findFirst({ where: { accountId, instagramId: senderKey } })
        : await prisma.contact.findFirst({
            where: {
              accountId,
              OR: [
                { emailId: senderKey },
                { email: senderKey },
                { emails: { array_contains: senderKey } },
              ],
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
      phone: byChannel.whatsappId ?? inbound.senderPhone,
    });
  }

  // Soft-merge: same email/WhatsApp on another channel within the account
  const inboundEmail = inbound.senderEmail
    ? extractEmailAddress(inbound.senderEmail)
    : channelType === "email"
      ? senderKey
      : null;

  const matched =
    (inboundEmail &&
      (await prisma.contact.findFirst({
        where: {
          accountId,
          OR: [
            { email: inboundEmail },
            { emailId: inboundEmail },
            { emails: { array_contains: inboundEmail } },
          ],
        },
      }))) ||
    (channelType !== "whatsapp" && waLookup
      ? await prisma.contact.findFirst({ where: waLookup })
      : null);

  if (matched) {
    return enableContactChannel({
      contactId: matched.id,
      channelType,
      externalId: senderKey,
      details,
      name: matched.name ?? inbound.senderName,
      email: matched.email ?? inboundEmail,
      phone: matched.whatsappId ?? inbound.senderPhone,
    });
  }

  const baseEmail = inbound.senderEmail
    ? extractEmailAddress(inbound.senderEmail)
    : channelType === "email"
      ? extractEmailAddress(senderKey)
      : undefined;
  const emails = uniqStrings([baseEmail]);
  const whatsappIds =
    channelType === "whatsapp"
      ? uniqWhatsAppIds([inbound.senderPhone, inbound.senderId, senderKey])
      : uniqWhatsAppIds([inbound.senderPhone]);

  const base = {
    id: ulid(),
    accountId,
    name: inbound.senderName ?? inbound.senderEmail ?? inbound.senderPhone ?? senderKey,
    email: emails[0] ?? null,
    emails,
  };

  if (channelType === "whatsapp") {
    return prisma.contact.create({
      data: {
        ...base,
        whatsappEnabled: true,
        whatsappId: whatsappIds[0] ?? senderKey,
        whatsappIds,
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
      email: emails[0] ?? extractEmailAddress(senderKey),
      emails: uniqStrings([...emails, extractEmailAddress(senderKey)]),
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
