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
import { recomputeCustomerResolved } from "./ResolveService.js";
import { isInboundSuppressed } from "./SuppressService.js";
import { enrichCustomerFromShopify } from "./orders/shopify-contact.service.js";
import {
  formatWhatsAppStorage as formatWa,
  normalizeWhatsAppDigits,
  whatsappApiRecipient,
  whatsappDigitsEqual,
} from "../utils/phone.js";

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
    // "***" = redacted placeholder from client; never overwrite real secrets
    if (typeof value === "string" && value.trim() === "***") continue;
    if (value === undefined) continue;
    if (value === null) {
      delete base[key];
      continue;
    }
    if (typeof value === "string" && !value.trim()) continue;
    base[key] = value;
  }
  delete base.mock;
  return base as Prisma.InputJsonValue;
}

export function normalizeWhatsAppId(raw: string | null | undefined): string | null {
  return normalizeWhatsAppDigits(raw);
}

export function formatWhatsAppStorage(raw: string | null | undefined): string | null {
  return formatWa(raw);
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
    const digits = normalizeWhatsAppId(externalId);
    if (!digits) return null;
    const formatted = formatWhatsAppStorage(digits) ?? digits;
    const exact = await prisma.whatsAppChannel.findFirst({
      where: {
        OR: [
          { externalId: digits },
          { externalId: `+${digits}` },
          { externalId: formatted },
        ],
      },
    });
    if (exact) return exact;

    // Suffix scan then full digit compare (handles "+91 …" vs "91…" legacy rows)
    const suffix = digits.length > 10 ? digits.slice(-10) : digits;
    const candidates = await prisma.whatsAppChannel.findMany({
      where: { externalId: { endsWith: suffix } },
      take: 25,
    });
    return candidates.find((c) => whatsappDigitsEqual(c.externalId, digits)) ?? null;
  }
  if (channelType === "instagram") {
    const exact = await prisma.instagramChannel.findUnique({ where: { externalId } });
    if (exact) return exact;
    const username = externalId.replace(/^@+/, "").trim();
    if (!username) return null;
    return prisma.instagramChannel.findFirst({
      where: {
        OR: [
          { metadata: { path: ["username"], equals: username } },
          { metadata: { path: ["username"], equals: `@${username}` } },
          { externalId: username },
          { externalId: `@${username}` },
        ],
      },
    });
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
 * Resolve customer for inbound message:
 *
 * Instagram
 *   1) Identity exists → reuse
 *   2) Else create named with @username when known (else "Unknown"); IGSID stays on identity for replies
 *
 * WhatsApp
 *   1) Identity exists → reuse
 *   2) Else Shopify by phone → get email → if CEP has that email, merge onto it
 *      else create customer with Shopify email + WhatsApp
 *   3) Else create customer from inbound only + attach WA
 *
 * Email
 *   1) Identity exists → reuse
 *   2) Else Shopify by email → get phone → if CEP has that WhatsApp, merge onto it
 *      else create customer with Shopify email + WhatsApp
 *   3) Else create customer from inbound only + attach email
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

  /** Instagram @handle for identity metadata — never display/name/bio text. */
  const lookslikeIgHandle = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const u = raw.replace(/^@+/, "").trim();
    if (!u || u.length > 30) return null;
    if (/\s|[|/]/.test(u) || /^\d{5,}$/.test(u)) return null;
    if (!/^[a-zA-Z0-9._]+$/.test(u)) return null;
    return u;
  };

  const igUsernameFromInbound = (): string | null => {
    if (channelType !== "instagram") return null;
    const raw = asMeta(inbound.raw as Prisma.JsonValue);
    const profile = asMeta(raw._profile as Prisma.JsonValue | undefined);
    return (
      lookslikeIgHandle(typeof profile.username === "string" ? profile.username : null) ||
      // Only accept senderName when it is already handle-shaped (@user), not a profile name.
      lookslikeIgHandle(inbound.senderName)
    );
  };

  const igHandle = igUsernameFromInbound();

  const igProfileName = (() => {
    if (channelType !== "instagram") return null;
    const raw = asMeta(inbound.raw as Prisma.JsonValue);
    const profile = asMeta(raw._profile as Prisma.JsonValue | undefined);
    const name = typeof profile.name === "string" ? profile.name.trim() : "";
    if (name && !/^\d{5,}$/.test(name) && !lookslikeIgHandle(name)) return name;
    return null;
  })();

  // Instagram: prefer @username as customer name; otherwise profile display name (not as @handle).
  const displayName =
    channelType === "instagram"
      ? igHandle
        ? `@${igHandle}`
        : igProfileName || "Unknown"
      : inbound.senderName?.trim() ||
        inbound.senderEmail?.trim() ||
        inbound.senderPhone?.trim() ||
        null;

  const metadata: Record<string, unknown> = {
    senderName: inbound.senderName ?? null,
  };
  if (channelType === "instagram") {
    if (igHandle) {
      metadata.username = igHandle;
      metadata.senderName = `@${igHandle}`;
    } else if (inbound.senderName?.trim()) {
      metadata.senderName = inbound.senderName.trim();
    }
  }

  const existing = await findIdentityByExternalId(channelType, senderKey);
  if (existing) {
    const customerId = existing.customerId;
    const prevMeta = asMeta(existing.metadata as Prisma.JsonValue);
    const mergedMeta = {
      ...prevMeta,
      ...metadata,
      // Never drop a known IG username if this inbound didn't resolve one
      ...(channelType === "instagram" &&
      prevMeta.username &&
      !metadata.username
        ? { username: prevMeta.username, senderName: prevMeta.senderName ?? prevMeta.username }
        : {}),
    } as Prisma.InputJsonValue;
    const occurredAt =
      inbound.occurredAt instanceof Date ? inbound.occurredAt : new Date();

    if (channelType === "whatsapp") {
      await prisma.whatsAppChannel.update({
        where: { id: existing.id },
        data: { resolved: false, metadata: mergedMeta },
      });
    } else if (channelType === "instagram") {
      const upgradeExternalId =
        /^\d{5,}$/.test(senderKey) && !/^\d{5,}$/.test(existing.externalId)
          ? senderKey
          : undefined;
      await prisma.instagramChannel.update({
        where: { id: existing.id },
        data: {
          resolved: false,
          metadata: mergedMeta,
          ...(upgradeExternalId ? { externalId: upgradeExternalId } : {}),
        },
      });
    } else {
      await prisma.emailChannel.update({
        where: { id: existing.id },
        data: { resolved: false, metadata: mergedMeta },
      });
    }
    await touchIdentityLastMessageAt(channelType, existing.id, occurredAt);

    if (channelType === "instagram" && igHandle) {
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      if (
        !customer.name ||
        customer.name === "Unknown" ||
        /^\d{5,}$/.test(customer.name) ||
        customer.name === existing.externalId
      ) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { name: `@${igHandle}` },
        });
      }
    } else if (channelType !== "instagram" && displayName && displayName !== "Unknown") {
      const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      if (!customer.name || customer.name === "Unknown" || /^\d{5,}$/.test(customer.name)) {
        await prisma.customer.update({
          where: { id: customerId },
          data: { name: displayName },
        });
      }
    }

    // Repeat inbound: still pull Shopify email/phone onto this customer
    if (channelType === "whatsapp" || channelType === "email") {
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
      if (email || phone) {
        try {
          await enrichCustomerFromShopify({
            name: displayName,
            email,
            phone,
            inboundChannel: channelType,
            preferredCustomerId: customerId,
          });
        } catch (err) {
          console.warn(
            "[inbound] shopify enrich (existing) skipped:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    }

    await recomputeCustomerResolved(customerId);
    const refreshedExternalId =
      channelType === "instagram" && /^\d{5,}$/.test(senderKey) && !/^\d{5,}$/.test(existing.externalId)
        ? senderKey
        : existing.externalId;
    return {
      customerId,
      channelId: existing.id,
      channelType,
      externalId: refreshedExternalId,
    };
  }

  // Shopify enrichment path (phone/email) — skip Instagram-only (no phone/email)
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
  if ((channelType === "whatsapp" || channelType === "email") && (email || phone)) {
    try {
      const shopifyHit = await enrichCustomerFromShopify({
        name: displayName,
        email,
        phone,
        inboundChannel: channelType,
      });
      if (shopifyHit?.customerId) customerId = shopifyHit.customerId;
    } catch (err) {
      console.warn("[inbound] shopify enrich skipped:", err instanceof Error ? err.message : err);
    }
  }

  if (!customerId) {
    const customer = await prisma.customer.create({
      data: {
        id: ulid(),
        name: displayName,
        resolved: false,
        metadata: {},
      },
    });
    customerId = customer.id;
  } else if (displayName && displayName !== "Unknown") {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (
      customer &&
      (!customer.name ||
        customer.name === "Unknown" ||
        (channelType === "instagram" && /^\d{5,}$/.test(customer.name)))
    ) {
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
  const occurredAt =
    inbound.occurredAt instanceof Date ? inbound.occurredAt : new Date();
  await touchIdentityLastMessageAt(channelType, identity.id, occurredAt);
  await recomputeCustomerResolved(customerId);
  return {
    customerId,
    channelId: identity.id,
    channelType,
    externalId: identity.externalId,
  };
}

async function touchIdentityLastMessageAt(
  channelType: ChannelType,
  identityId: string,
  at: Date = new Date(),
) {
  const when = at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();
  if (channelType === "whatsapp") {
    const row = await prisma.whatsAppChannel.findUnique({
      where: { id: identityId },
      select: { lastMessageAt: true },
    });
    if (row?.lastMessageAt && row.lastMessageAt.getTime() >= when.getTime()) return;
    await prisma.whatsAppChannel.update({
      where: { id: identityId },
      data: { lastMessageAt: when },
    });
    return;
  }
  if (channelType === "instagram") {
    const row = await prisma.instagramChannel.findUnique({
      where: { id: identityId },
      select: { lastMessageAt: true },
    });
    if (row?.lastMessageAt && row.lastMessageAt.getTime() >= when.getTime()) return;
    await prisma.instagramChannel.update({
      where: { id: identityId },
      data: { lastMessageAt: when },
    });
    return;
  }
  const row = await prisma.emailChannel.findUnique({
    where: { id: identityId },
    select: { lastMessageAt: true },
  });
  if (row?.lastMessageAt && row.lastMessageAt.getTime() >= when.getTime()) return;
  await prisma.emailChannel.update({
    where: { id: identityId },
    data: { lastMessageAt: when },
  });
}

/**
 * Link a provider-sourced *outgoing* message (device/app reply) to an existing identity.
 * Does not mark the thread unresolved — agent already handled it outside CEP.
 * Creates the identity only for email/whatsapp when the peer is new; Instagram requires a prior DM.
 */
async function resolveIdentityForOutgoing(input: {
  channelType: ChannelType;
  inbound: NormalizedInboundMessage;
}): Promise<{
  customerId: string;
  channelId: string;
  channelType: ChannelType;
  externalId: string;
} | null> {
  const { channelType, inbound } = input;
  const peerRaw = inbound.peerId ?? inbound.senderId;
  const peerKey =
    channelType === "email"
      ? normalizeEmail(peerRaw) ?? peerRaw
      : channelType === "whatsapp"
        ? normalizeWhatsAppId(peerRaw) ?? peerRaw
        : peerRaw;

  const existing = await findIdentityByExternalId(channelType, peerKey);
  if (existing) {
    const occurredAt =
      inbound.occurredAt instanceof Date ? inbound.occurredAt : new Date();
    await touchIdentityLastMessageAt(channelType, existing.id, occurredAt);
    return {
      customerId: existing.customerId,
      channelId: existing.id,
      channelType,
      externalId: existing.externalId,
    };
  }

  if (channelType === "instagram") {
    console.warn(
      `[outbound-sync] instagram echo for unknown peer=${peerKey} — skipped (customer must message first)`,
    );
    return null;
  }

  // Email / WhatsApp: create contact from the peer so device replies still land in CEP.
  const synthetic: NormalizedInboundMessage = {
    ...inbound,
    senderId: peerKey,
    peerId: undefined,
    direction: "incoming",
    senderEmail: channelType === "email" ? peerKey : inbound.senderEmail,
    senderPhone: channelType === "whatsapp" ? peerKey : inbound.senderPhone,
  };
  const link = await findOrCreateCustomerForInbound({
    channelType,
    inbound: synthetic,
  });
  // findOrCreate marks unresolved — undo for agent-originated outbound
  const occurredAt =
    inbound.occurredAt instanceof Date ? inbound.occurredAt : new Date();
  if (channelType === "whatsapp") {
    await prisma.whatsAppChannel.update({
      where: { id: link.channelId },
      data: { resolved: true },
    });
  } else {
    await prisma.emailChannel.update({
      where: { id: link.channelId },
      data: { resolved: true },
    });
  }
  await touchIdentityLastMessageAt(channelType, link.channelId, occurredAt);
  await recomputeCustomerResolved(link.customerId);
  return link;
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
    // Enrich customer profiles for inbound; echoes already use customer IGSID as senderId
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

  let alreadySeen = false;
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
    // Event key already recorded — still attempt message create (prior run may have failed mid-ingest).
    alreadySeen = true;
  }

  const created = [];
  for (const inbound of inboundMessages) {
    if (!inbound.externalId) continue;

    // Agent dismissed / deleted — do not resurrect via Pub/Sub or catch-up.
    if (await isInboundSuppressed(channelCfg.channelType, inbound.externalId)) {
      continue;
    }

    // Pub/Sub / catch-up / echoes re-deliver the same provider ids.
    const alreadyStored = await prisma.message.findFirst({
      where: {
        channelType: channelCfg.channelType,
        externalId: inbound.externalId,
      },
      select: { id: true },
    });
    if (alreadyStored) continue;

    const direction = inbound.direction === "outgoing" ? "outgoing" : "incoming";
    const link =
      direction === "outgoing"
        ? await resolveIdentityForOutgoing({
            channelType: channelCfg.channelType,
            inbound,
          })
        : await findOrCreateCustomerForInbound({
            channelType: channelCfg.channelType,
            inbound,
          });
    if (!link) continue;

    const receivedAt = inbound.occurredAt instanceof Date ? inbound.occurredAt : new Date();
    try {
      const message = await prisma.message.create({
        data: {
          id: ulid(),
          channelType: link.channelType,
          channelId: link.channelId,
          customerId: link.customerId,
          direction,
          content: inbound.content,
          contentType: mapContentType(inbound.contentType),
          subject: inbound.subject,
          externalId: inbound.externalId,
          status: direction === "outgoing" ? "sent" : "received",
          rawPayload: inbound.raw as Prisma.InputJsonValue,
          createdAt: receivedAt,
        },
      });
      created.push(message);
    } catch {
      // duplicate external id for this identity
    }
  }

  await prisma.webhookEvent.updateMany({
    where: { channelConfigId: channelCfg.id, eventKey },
    data: { processed: true },
  });

  return {
    created: created.length,
    duplicates: alreadySeen && created.length === 0,
    messages: created,
  };
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
      ? whatsappApiRecipient(identity.externalId) ?? identity.externalId.replace(/\D/g, "")
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

  if (!result.ok || result.status === "failed") {
    return {
      message: null,
      result: {
        ok: false,
        status: result.status,
        error: result.error ?? "Message failed to send on channel",
        externalId: result.externalId,
      },
      channelId: identity.id,
      externalId: identity.externalId,
    };
  }

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
        to,
        ...(result.raw && typeof result.raw === "object" ? (result.raw as object) : {}),
      } as Prisma.InputJsonValue,
    },
  });

  // Touch the identity we actually messaged (activity timestamp).
  // Resolve is manual only — agents click Resolve in the Inbox UI.
  await touchIdentityLastMessageAt(input.channelType, identity.id, message.createdAt);

  await recomputeCustomerResolved(input.customerId);

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
      const rawUsername =
        typeof meta.username === "string" ? meta.username.replace(/^@/, "").trim() : "";
      // Instagram usernames never contain spaces / "|"; display names must not become handles.
      const username =
        rawUsername &&
        rawUsername.length <= 30 &&
        !/\s|[|/]/.test(rawUsername) &&
        /^[a-zA-Z0-9._]+$/.test(rawUsername)
          ? rawUsername
          : "";
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

  const primaryIg = ig[0];
  const igMeta = primaryIg ? asMeta(primaryIg.metadata as Prisma.JsonValue) : null;
  const rawIgUsername =
    (typeof igMeta?.username === "string" && igMeta.username.replace(/^@/, "").trim()) ||
    (primaryIg && !/^\d{5,}$/.test(primaryIg.externalId)
      ? primaryIg.externalId.replace(/^@/, "").trim()
      : "") ||
    "";
  const igUsername =
    rawIgUsername &&
    rawIgUsername.length <= 30 &&
    !/\s|[|/]/.test(rawIgUsername) &&
    /^[a-zA-Z0-9._]+$/.test(rawIgUsername)
      ? rawIgUsername
      : null;

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
    /** Username/handle for UI — never the numeric Instagram-scoped id when username is known. */
    instagramId: igUsername,
    instagramScopedId: primaryIg?.externalId ?? null,
    instagramDetails: igMeta
      ? {
          ...igMeta,
          ...(igUsername ? { username: igUsername } : { username: null }),
        }
      : null,
    resolved: customer.resolved,
    globalStatus: customer.resolved ? ("resolved" as const) : ("active" as const),
    identifiers: {
      ...(whatsappIds[0] ? { whatsapp: whatsappIds[0] } : {}),
      ...(igUsername ? { instagram: igUsername } : {}),
      ...(emails[0] ? { email: emails[0] } : {}),
    },
    identities,
    metadata: customer.metadata,
  };
}
