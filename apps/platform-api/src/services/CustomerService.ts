import { ulid } from "ulid";
import { prisma } from "../config/db.js";
import {
  formatWhatsAppStorage,
  normalizeWhatsAppId,
  shapeCustomer,
} from "./MessagingService.js";
import { recomputeCustomerResolved } from "./ResolveService.js";
import { enrichCustomerFromShopify } from "./orders/shopify-contact.service.js";

function normalizeEmail(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().toLowerCase();
}

function normalizeIg(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^@+/, "");
}

export function isUnknownName(name?: string | null): boolean {
  if (!name?.trim()) return true;
  return name.trim().toLowerCase() === "unknown";
}

export async function loadCustomerShaped(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      emailIdentities: true,
    },
  });
  return customer ? shapeCustomer(customer) : null;
}

export async function findMatchingCustomers(input: {
  emails?: string[];
  whatsappIds?: string[];
  instagramId?: string | null;
}) {
  const emails = (input.emails ?? []).map(normalizeEmail).filter(Boolean) as string[];
  const wa = (input.whatsappIds ?? [])
    .map((w) => normalizeWhatsAppId(w) ?? w)
    .filter(Boolean) as string[];
  const ig = normalizeIg(input.instagramId);

  const customerIds = new Set<string>();
  for (const email of emails) {
    const row = await prisma.emailChannel.findUnique({ where: { externalId: email } });
    if (row) customerIds.add(row.customerId);
  }
  for (const phone of wa) {
    const digits = normalizeWhatsAppId(phone) ?? phone.replace(/\D/g, "");
    const formatted = formatWhatsAppStorage(phone) ?? phone;
    const exact = await prisma.whatsAppChannel.findMany({
      where: {
        OR: [
          { externalId: phone },
          { externalId: formatted },
          { externalId: digits },
          { externalId: `+${digits}` },
        ],
      },
    });
    for (const r of exact) customerIds.add(r.customerId);

    if (digits.length >= 10) {
      const suffix = digits.slice(-10);
      const candidates = await prisma.whatsAppChannel.findMany({
        where: { externalId: { endsWith: suffix } },
        take: 25,
      });
      for (const r of candidates) {
        const rd = normalizeWhatsAppId(r.externalId);
        if (rd && (rd === digits || rd.endsWith(digits) || digits.endsWith(rd))) {
          customerIds.add(r.customerId);
        }
      }
    }
  }
  if (ig) {
    const row = await prisma.instagramChannel.findFirst({
      where: {
        OR: [{ externalId: ig }, { metadata: { path: ["username"], equals: ig } }],
      },
    });
    if (row) customerIds.add(row.customerId);
  }

  if (!customerIds.size) return [];
  const customers = await prisma.customer.findMany({
    where: { id: { in: [...customerIds] } },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      emailIdentities: true,
    },
  });
  return customers.map(shapeCustomer);
}

async function attachIdentities(
  customerId: string,
  input: {
    emails?: string[];
    whatsappIds?: string[];
    instagramId?: string | null;
  },
) {
  for (const raw of input.emails ?? []) {
    const email = normalizeEmail(raw);
    if (!email) continue;
    const existing = await prisma.emailChannel.findUnique({ where: { externalId: email } });
    if (existing) {
      if (existing.customerId !== customerId) {
        // Move ownership onto this customer (merge-safe)
        await prisma.message.updateMany({
          where: { channelType: "email", channelId: existing.id },
          data: { customerId },
        });
        await prisma.emailChannel.update({
          where: { id: existing.id },
          data: { customerId },
        });
        await recomputeCustomerResolved(existing.customerId);
      }
      continue;
    }
    await prisma.emailChannel.create({
      data: { id: ulid(), customerId, externalId: email, resolved: true, metadata: {} },
    });
  }

  for (const raw of input.whatsappIds ?? []) {
    const digits = normalizeWhatsAppId(raw);
    if (!digits) continue;
    const externalId = formatWhatsAppStorage(digits) ?? digits;
    let existing = await prisma.whatsAppChannel.findFirst({
      where: {
        OR: [
          { externalId },
          { externalId: digits },
          { externalId: `+${digits}` },
        ],
      },
    });
    if (!existing && digits.length >= 10) {
      const candidates = await prisma.whatsAppChannel.findMany({
        where: { externalId: { endsWith: digits.slice(-10) } },
        take: 25,
      });
      existing =
        candidates.find((c) => {
          const rd = normalizeWhatsAppId(c.externalId);
          return rd === digits;
        }) ?? null;
    }
    if (existing) {
      if (existing.customerId !== customerId) {
        await prisma.message.updateMany({
          where: { channelType: "whatsapp", channelId: existing.id },
          data: { customerId },
        });
        await prisma.whatsAppChannel.update({
          where: { id: existing.id },
          data: { customerId, externalId },
        });
        await recomputeCustomerResolved(existing.customerId);
      } else if (existing.externalId !== externalId) {
        // Normalize legacy storage to "+dial national"
        await prisma.whatsAppChannel.update({
          where: { id: existing.id },
          data: { externalId },
        });
      }
      continue;
    }
    await prisma.whatsAppChannel.create({
      data: { id: ulid(), customerId, externalId, resolved: true, metadata: {} },
    });
  }

  const ig = normalizeIg(input.instagramId);
  if (ig) {
    const existing = await prisma.instagramChannel.findFirst({
      where: {
        OR: [{ externalId: ig }, { metadata: { path: ["username"], equals: ig } }],
      },
    });

    const withUsernameMeta = (metadata: unknown) => {
      const base =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? { ...(metadata as Record<string, unknown>) }
          : {};
      return { ...base, username: ig, senderName: `@${ig}` };
    };

    if (existing) {
      if (existing.customerId !== customerId) {
        await prisma.message.updateMany({
          where: { channelType: "instagram", channelId: existing.id },
          data: { customerId },
        });
        await prisma.instagramChannel.update({
          where: { id: existing.id },
          data: {
            customerId,
            metadata: withUsernameMeta(existing.metadata),
            // Keep numeric Instagram-scoped ids for messaging; username-only rows may rename
            ...(/^\d{5,}$/.test(existing.externalId) ? {} : { externalId: ig }),
          },
        });
        await recomputeCustomerResolved(existing.customerId);
      } else {
        await prisma.instagramChannel.update({
          where: { id: existing.id },
          data: {
            metadata: withUsernameMeta(existing.metadata),
            ...(/^\d{5,}$/.test(existing.externalId) ? {} : { externalId: ig }),
          },
        });
      }
    } else {
      const owned = await prisma.instagramChannel.findFirst({
        where: { customerId },
        orderBy: [{ updatedAt: "desc" }],
      });
      if (owned) {
        // Contact already has an IG thread id — only refresh username metadata
        await prisma.instagramChannel.update({
          where: { id: owned.id },
          data: {
            metadata: withUsernameMeta(owned.metadata),
            ...(/^\d{5,}$/.test(owned.externalId) ? {} : { externalId: ig }),
          },
        });
      } else {
        await prisma.instagramChannel.create({
          data: {
            id: ulid(),
            customerId,
            externalId: ig,
            resolved: true,
            metadata: { username: ig, senderName: `@${ig}` },
          },
        });
      }
    }
  }

  await recomputeCustomerResolved(customerId);
}

/** Move every identity + message from source → target, then delete source. */
async function absorbCustomer(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const source = await prisma.customer.findUnique({
    where: { id: sourceId },
    include: {
      whatsappIdentities: true,
      instagramIdentities: true,
      emailIdentities: true,
    },
  });
  if (!source) return;

  for (const wa of source.whatsappIdentities) {
    const clash = await prisma.whatsAppChannel.findFirst({
      where: { customerId: targetId, externalId: wa.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "whatsapp", channelId: wa.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.whatsAppChannel.delete({ where: { id: wa.id } });
    } else {
      await prisma.whatsAppChannel.update({
        where: { id: wa.id },
        data: { customerId: targetId },
      });
    }
  }
  for (const ig of source.instagramIdentities) {
    const clash = await prisma.instagramChannel.findFirst({
      where: { customerId: targetId, externalId: ig.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "instagram", channelId: ig.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.instagramChannel.delete({ where: { id: ig.id } });
    } else {
      await prisma.instagramChannel.update({
        where: { id: ig.id },
        data: { customerId: targetId },
      });
    }
  }
  for (const em of source.emailIdentities) {
    const clash = await prisma.emailChannel.findFirst({
      where: { customerId: targetId, externalId: em.externalId },
    });
    if (clash) {
      await prisma.message.updateMany({
        where: { channelType: "email", channelId: em.id },
        data: { channelId: clash.id, customerId: targetId },
      });
      await prisma.emailChannel.delete({ where: { id: em.id } });
    } else {
      await prisma.emailChannel.update({
        where: { id: em.id },
        data: { customerId: targetId },
      });
    }
  }

  await prisma.message.updateMany({
    where: { customerId: sourceId },
    data: { customerId: targetId },
  });
  await prisma.customer.delete({ where: { id: sourceId } }).catch(() => undefined);
}

export async function createCustomer(input: {
  name?: string | null;
  emails?: string[];
  whatsappIds?: string[];
  instagramId?: string | null;
  mergeIntoId?: string;
  keepName?: string | null;
  force?: boolean;
}) {
  if (input.mergeIntoId) {
    await attachIdentities(input.mergeIntoId, input);
    const name = input.keepName ?? input.name;
    if (name && !isUnknownName(name)) {
      await prisma.customer.update({
        where: { id: input.mergeIntoId },
        data: { name },
      });
    }
    return loadCustomerShaped(input.mergeIntoId);
  }

  if (!input.force) {
    const matches = await findMatchingCustomers(input);
    if (matches.length) {
      return { needsMerge: true as const, matches };
    }
  }

  // Shopify read-only lookup — never writes to Shopify
  try {
    const hasEmail = Boolean(input.emails?.[0]?.trim());
    const shopify = await enrichCustomerFromShopify({
      name: input.name,
      email: input.emails?.[0],
      phone: input.whatsappIds?.[0],
      inboundChannel: hasEmail ? "email" : "whatsapp",
    });
    if (shopify?.customerId) {
      await attachIdentities(shopify.customerId, input);
      if (input.name && !isUnknownName(input.name)) {
        await prisma.customer.update({
          where: { id: shopify.customerId },
          data: { name: input.name },
        });
      }
      return loadCustomerShaped(shopify.customerId);
    }
  } catch {
    /* continue create locally */
  }

  const customer = await prisma.customer.create({
    data: {
      id: ulid(),
      name: input.name?.trim() || null,
      resolved: false,
      metadata: {},
    },
  });
  await attachIdentities(customer.id, input);
  return loadCustomerShaped(customer.id);
}

export async function updateCustomer(
  id: string,
  input: {
    name?: string | null;
    emails?: string[];
    whatsappIds?: string[];
    instagramId?: string | null;
    mergeIntoId?: string;
    keepName?: string | null;
    force?: boolean;
  },
) {
  if (input.mergeIntoId && input.mergeIntoId !== id) {
    await absorbCustomer(id, input.mergeIntoId);
    await attachIdentities(input.mergeIntoId, input);
    const name = input.keepName ?? input.name;
    if (name && !isUnknownName(name)) {
      await prisma.customer.update({
        where: { id: input.mergeIntoId },
        data: { name },
      });
    } else if (input.keepName) {
      await prisma.customer.update({
        where: { id: input.mergeIntoId },
        data: { name: input.keepName },
      });
    }
    await recomputeCustomerResolved(input.mergeIntoId);
    return loadCustomerShaped(input.mergeIntoId);
  }

  if (!input.force) {
    const matches = await findMatchingCustomers(input);
    const other = matches.filter((m) => m.id !== id);
    if (other.length) {
      return { needsMerge: true as const, matches: other };
    }
  }

  if (input.name !== undefined) {
    await prisma.customer.update({
      where: { id },
      data: { name: input.name },
    });
  }
  await attachIdentities(id, input);
  return loadCustomerShaped(id);
}

export async function mergeCustomers(input: {
  targetId: string;
  sourceIds: string[];
  keepName: string;
}) {
  for (const sourceId of input.sourceIds) {
    if (sourceId === input.targetId) continue;
    await absorbCustomer(sourceId, input.targetId);
  }
  await prisma.customer.update({
    where: { id: input.targetId },
    data: { name: input.keepName },
  });
  await recomputeCustomerResolved(input.targetId);
  return loadCustomerShaped(input.targetId);
}
