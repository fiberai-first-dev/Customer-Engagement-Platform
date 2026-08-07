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
import { recomputeCustomerResolved, setChannelResolved } from "./ResolveService.js";
import { enrichCustomerFromShopify } from "./orders/shopify-contact.service.js";

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
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    base[key] = value;
  }
  delete base.mock;
  return base as Prisma.InputJsonValue;
}

export function normalizeWhatsAppId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits || null;
}

export function formatWhatsAppStorage(raw: string | null | undefined): string | null {
  const digits = normalizeWhatsAppId(raw);
  if (!digits) return null;
  if (digits.length > 10) return `+${digits.slice(0, -10)} ${digits.slice(-10)}`;
  if (digits.length === 10) return `+91 ${digits}`;
  return `+${digits}`;
}

function mapContentType(value: NormalizedInboundMessage["contentType"]): ContentType {
  return value;
}

function mapSendStatus(status: string): MessageStatus {
  if (status === "queued") return "queued";
  if (status === "failed") return "failed";
  return "sent";
}

function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = extractEmailAddress(raw).trim().toLowerCase();
  return v || null;
}

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function getEnabledChannelConfig(channelType: ChannelType) {
  return prisma.channelConfig.findFirst({
    where: { channelType },
    orderBy: { createdAt: "asc" },
  });
}

/** Find channel identity by external id across tables. */
export async function findIdentityByExternalId(
  channelType: ChannelType,
  externalId: string,
) {
  if (channelType === "whatsapp") {
    const digits = normalizeWhatsAppId(externalId) ?? externalId;
    return prisma.whatsAppChannel.findFirst({
      where: {
        OR: [
          { externalId: digits },
          { externalId: `+${digits}` },
          { externalId: formatWhatsAppStorage(digits) ?? digits },
        ],
      },
    });
  }
  if (channelType === "instagram") {
    return prisma.instagramChannel.findUnique({ where: { externalId } });
  }
  const email = normalizeEmail(externalId) ?? externalId;
  return prisma.emailChannel.findUnique({ where: { externalId: email } });
}

export async function getMostRecentIdentity(
  customerId: string,
  channelType: ChannelType,
) {
  if (channelType === "whatsapp") {
    return prisma.whatsAppChannel.findFirst({
      where: { customerId },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    });
  }
  if (channelType === "instagram") {
    return prisma.instagramChannel.findFirst({
      where: { customerId },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
    });
  }
  return prisma.emailChannel.findFirst({
    where: { customerId },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });
}

async function createIdentity(input: {
  customerId: string;
  channelType: ChannelType;
  externalId: string;
  metadata?: Record<string, unknown>;
  resolved?: boolean;
}) {
  const id = ulid();
  const metadata = (input.metadata ?? {}) as Prisma.InputJsonValue;
  if (input.channelType === "whatsapp") {
    const externalId =
      formatWhatsAppStorage(input.externalId) ??
      normalizeWhatsAppId(input.externalId) ??
      input.externalId;
    return prisma.whatsAppChannel.create({
      data: {
        id,
        customerId: input.customerId,
        externalId,
        resolved: input.resolved ?? false,
        metadata,
      },
    });
  }
  if (input.channelType === "instagram") {
    return prisma.instagramChannel.create({
      data: {
        id,
        customerId: input.customerId,
        externalId: input.externalId,
        resolved: input.resolved ?? false,
        metadata,
      },
    });
  }
  const email = normalizeEmail(input.externalId) ?? input.externalId;
  return prisma.emailChannel.create({
    data: {
      id,
      customerId: input.customerId,
      externalId: email,
      resolved: input.resolved ?? false,
      metadata,
    },
  });
}

/**
 * Resolve customer for inbound:
 * 1) identity exists → use that customer, mark unresolved
 * 2) else Shopify read-only lookup → attach to matched CEP customer (or create local from Shopify data)
 * 3) else new customer + identity
 */
export async function findOrCreateCustomerForInbound(input: {
  channelType: ChannelType;
  inbound: NormalizedInboundMessage;
}) {
  const { channelType, inbound } = input;
  const senderKey =
    channelType === "email"
      ? normalizeEmail(inbound.senderId) ?? inbound.senderId
      : channelType === "whatsapp"
        ? normalizeWhatsAppId(inbound.senderId) ?? inbound.senderId
        : inbound.senderId;

  const displayName =
    channelType === "instagram"
      ? inbound.senderName?.trim() || "Unknown"
      : inbound.senderName?.trim() ||
        inbound.senderEmail?.trim() ||
        inbound.senderPhone?.trim() ||
        null;

  const metadata: Record<string, unknown> = {
    senderName: inbound.senderName ?? null,
  };
  if (channelType === "instagram" && inbound.senderName?.startsWith("@")) {
    metadata.username = inbound.senderName.slice(1);
  }

  const existing = await findIdentityByExternalId(channelType, senderKey);
  if (existing) {
    const customerId = existing.customerId;
    if (channelType === "whatsapp") {
      await prisma.whatsAppChannel.update({
        where: { id: existing.id },
        data: { resolved: false, lastMessageAt: new Date(), metadata: metadata as Prisma.InputJsonValue },
      });
    } else if (channelType === "instagram") {
      await prisma.instagramChannel.update({
        where: { id: existing.id },
        data: { resolved: false, lastMessageAt: new Date(), metadata: metadata as Prisma.InputJsonValue },
      });
    } else {
      await prisma.emailChannel.update({
        where: { id: existing.id },
        data: { resolved: false, lastMessageAt: new Date(), metadata: metadata as Prisma.InputJsonValue },
      });
    }
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    if (
      displayName &&
      displayName !== "Unknown" &&
      (!customer.name || customer.name === "Unknown" || /^\d{5,}$/.test(customer.name))
    ) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { name: displayName },
      });
    }
    await recomputeCustomerResolved(customerId);
    return {
      customerId,
      channelId: existing.id,
      channelType,
      externalId: existing.externalId,
    };
  }

  // Shopify enrichment path (phone/email)
  const phone =
    channelType === "whatsapp"
      ? senderKey
      : inbound.senderPhone
        ? normalizeWhatsAppId(inbound.senderPhone)
        : null;
  const email =
    channelType === "email"
      ? senderKey
      : inbound.senderEmail
        ? normalizeEmail(inbound.senderEmail)
        : null;

  let customerId: string | null = null;
  try {
    const shopifyHit = await enrichCustomerFromShopify({
      name: displayName,
      email,
      phone,
    });
    if (shopifyHit?.customerId) customerId = shopifyHit.customerId;
  } catch (err) {
    console.warn("[inbound] shopify enrich skipped:", err instanceof Error ? err.message : err);
  }

  if (!customerId) {
    const customer = await prisma.customer.create({
      data: {
        id: ulid(),
        name: displayName || (channelType === "instagram" ? "Unknown" : null),
        resolved: false,
        metadata: {},
      },
    });
    customerId = customer.id;
  } else if (displayName && displayName !== "Unknown") {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer && (!customer.name || customer.name === "Unknown")) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { name: displayName },
      });
    }
  }

  // Identity may already exist on shopify-matched customer for another field — recheck
  const again = await findIdentityByExternalId(channelType, senderKey);
  if (again) {
    await recomputeCustomerResolved(again.customerId);
    return {
      customerId: again.customerId,
      channelId: again.id,
      channelType,
      externalId: again.externalId,
    };
  }

  const identity = await createIdentity({
    customerId,
    channelType,
    externalId: senderKey,
    metadata,
    resolved: false,
  });
  if (channelType === "whatsapp") {
    await prisma.whatsAppChannel.update({
      where: { id: identity.id },
      data: { lastMessageAt: new Date() },
    });
  } else if (channelType === "instagram") {
    await prisma.instagramChannel.update({
      where: { id: identity.id },
      data: { lastMessageAt: new Date() },
    });
  } else {
    await prisma.emailChannel.update({
      where: { id: identity.id },
      data: { lastMessageAt: new Date() },
    });
  }
  await recomputeCustomerResolved(customerId);
  return {
    customerId,
    channelId: identity.id,
    channelType,
    externalId: identity.externalId,
  };
}

export async function ingestInboundMessages(input: {
  channelConfigId: string;
  payload: unknown;
  eventKey?: string;
}) {
  const channelCfg = await prisma.channelConfig.findUnique({
    where: { id: input.channelConfigId },
  });
  if (!channelCfg) throw new Error("Channel config not found");
  if (!channelCfg.enabled) throw new Error("Channel is disabled");

  const adapter =
    channelCfg.channelType === "email"
      ? getEmailAdapter(channelCfg.channelConfig)
      : getChannelAdapter(channelCfg.channelType);
  const config = resolveChannelConfig(channelCfg.channelType, channelCfg.channelConfig);
  let inboundMessages = adapter.parseInbound(config, input.payload);

  if (channelCfg.channelType === "instagram" && inboundMessages.length) {
    const { enrichInstagramInboundNames } = await import("../adapters/instagram/index.js");
    inboundMessages = await enrichInstagramInboundNames(
      config as import("../adapters/shared/types.js").InstagramChannelConfig,
      inboundMessages,
    );
    for (const m of inboundMessages) {
      if (!m.senderName?.trim()) m.senderName = "Unknown";
    }
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
        channelConfigId: channelCfg.id,
        channel: channelCfg.channelType,
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
    const link = await findOrCreateCustomerForInbound({
      channelType: channelCfg.channelType,
      inbound,
    });
    const receivedAt = new Date();
    try {
      const message = await prisma.message.create({
        data: {
          id: ulid(),
          channelType: link.channelType,
          channelId: link.channelId,
          customerId: link.customerId,
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
      created.push(message);
    } catch {
      // duplicate external id
    }
  }

  await prisma.webhookEvent.updateMany({
    where: { channelConfigId: channelCfg.id, eventKey },
    data: { processed: true },
  });

  return { created: created.length, duplicates: false, messages: created };
}

export async function sendCustomerChannelMessage(input: {
  customerId: string;
  channelType: ChannelType;
  content: string;
  subject?: string;
}) {
  const channelCfg = await getEnabledChannelConfig(input.channelType);
  if (!channelCfg || !channelCfg.enabled) {
    throw new Error(`${input.channelType} channel is disabled`);
  }

  const identity = await getMostRecentIdentity(input.customerId, input.channelType);
  if (!identity) throw new Error(`No ${input.channelType} identity on customer`);

  const adapter =
    input.channelType === "email"
      ? getEmailAdapter(channelCfg.channelConfig)
      : getChannelAdapter(input.channelType);
  const config = resolveChannelConfig(input.channelType, channelCfg.channelConfig) as ChannelConfig;

  const to =
    input.channelType === "whatsapp"
      ? normalizeWhatsAppId(identity.externalId) ?? identity.externalId
      : identity.externalId;

  const lastInbound = await prisma.message.findFirst({
    where: {
      channelType: input.channelType,
      channelId: identity.id,
      direction: "incoming",
    },
    orderBy: { createdAt: "desc" },
  });

  let subject = input.subject;
  if (input.channelType === "email" && !subject) {
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
    replyToExternalId: lastInbound?.externalId ?? undefined,
  });

  const message = await prisma.message.create({
    data: {
      id: ulid(),
      channelType: input.channelType,
      channelId: identity.id,
      customerId: input.customerId,
      direction: "outgoing",
      content: input.content,
      contentType: "text",
      subject,
      externalId: result.externalId ?? `local_${ulid()}`,
      status: mapSendStatus(result.status),
      rawPayload: {
        error: result.error,
        to,
        ...(result.raw && typeof result.raw === "object" ? (result.raw as object) : {}),
      } as Prisma.InputJsonValue,
    },
  });

  if (input.channelType === "whatsapp") {
    await prisma.whatsAppChannel.update({
      where: { id: identity.id },
      data: {
        lastMessageAt: new Date(),
        ...(result.status !== "failed" ? { resolved: true } : {}),
      },
    });
  } else if (input.channelType === "instagram") {
    await prisma.instagramChannel.update({
      where: { id: identity.id },
      data: {
        lastMessageAt: new Date(),
        ...(result.status !== "failed" ? { resolved: true } : {}),
      },
    });
  } else {
    await prisma.emailChannel.update({
      where: { id: identity.id },
      data: {
        lastMessageAt: new Date(),
        ...(result.status !== "failed" ? { resolved: true } : {}),
      },
    });
  }

  if (result.status !== "failed") {
    await setChannelResolved({
      channelType: input.channelType,
      channelId: identity.id,
      resolved: true,
    });
  } else {
    await recomputeCustomerResolved(input.customerId);
  }

  return {
    message,
    result: {
      ok: result.ok,
      status: result.status,
      error: result.error,
      externalId: result.externalId,
    },
    channelId: identity.id,
    externalId: identity.externalId,
  };
}

/** Compat shapes for UI */
export function shapeCustomer(customer: {
  id: string;
  name: string | null;
  resolved: boolean;
  metadata?: unknown;
  whatsappIdentities?: Array<{ id: string; externalId: string; resolved: boolean; metadata: unknown; lastMessageAt: Date | null }>;
  instagramIdentities?: Array<{ id: string; externalId: string; resolved: boolean; metadata: unknown; lastMessageAt: Date | null }>;
  emailIdentities?: Array<{ id: string; externalId: string; resolved: boolean; metadata: unknown; lastMessageAt: Date | null }>;
}) {
  const wa = customer.whatsappIdentities ?? [];
  const ig = customer.instagramIdentities ?? [];
  const em = customer.emailIdentities ?? [];
  const whatsappIds = wa.map((i) => formatWhatsAppStorage(i.externalId) ?? i.externalId);
  const emails = em.map((i) => i.externalId);
  const identities = [
    ...wa.map((i) => ({
      id: i.id,
      channel: "whatsapp" as const,
      externalId: formatWhatsAppStorage(i.externalId) ?? i.externalId,
      displayId: formatWhatsAppStorage(i.externalId) ?? i.externalId,
      metadata: asMeta(i.metadata as Prisma.JsonValue),
      enabled: true,
      resolved: i.resolved,
      lastMessageAt: i.lastMessageAt,
    })),
    ...ig.map((i) => {
      const meta = asMeta(i.metadata as Prisma.JsonValue);
      const username = typeof meta.username === "string" ? meta.username.replace(/^@/, "") : "";
      return {
        id: i.id,
        channel: "instagram" as const,
        externalId: i.externalId,
        displayId: username ? `@${username}` : i.externalId,
        metadata: meta,
        enabled: true,
        resolved: i.resolved,
        lastMessageAt: i.lastMessageAt,
      };
    }),
    ...em.map((i) => ({
      id: i.id,
      channel: "email" as const,
      externalId: i.externalId,
      displayId: i.externalId,
      metadata: asMeta(i.metadata as Prisma.JsonValue),
      enabled: true,
      resolved: i.resolved,
      lastMessageAt: i.lastMessageAt,
    })),
  ];

  return {
    id: customer.id,
    name: customer.name,
    email: emails[0] ?? null,
    emails,
    whatsappId: whatsappIds[0] ?? null,
    whatsappIds,
    whatsappEnabled: wa.length > 0,
    instagramEnabled: ig.length > 0,
    emailEnabled: em.length > 0,
    instagramId: ig[0]?.externalId ?? null,
    instagramDetails: ig[0] ? asMeta(ig[0].metadata as Prisma.JsonValue) : null,
    resolved: customer.resolved,
    globalStatus: customer.resolved ? ("resolved" as const) : ("active" as const),
    identifiers: {
      ...(whatsappIds[0] ? { whatsapp: whatsappIds[0] } : {}),
      ...(ig[0] ? { instagram: ig[0].externalId } : {}),
      ...(emails[0] ? { email: emails[0] } : {}),
    },
    identities,
    metadata: customer.metadata,
  };
}
