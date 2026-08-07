import { ulid } from "ulid";
import { prisma } from "../../config/db.js";
import { resolveShopifyCredentials } from "./shopify.client.js";
import { shopifyOrderProvider } from "./order.service.js";
import { recomputeCustomerResolved } from "../ResolveService.js";

/**
 * Read-only Shopify lookup. Never creates/updates Shopify records.
 * If a Shopify customer is found, links/creates the matching CEP customer locally.
 */
export async function enrichCustomerFromShopify(input: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ customerId: string; created: boolean; shopifyCustomerId?: string } | null> {
  const creds = await resolveShopifyCredentials();
  if (!creds) return null;

  if (!input.email && !input.phone) return null;

  try {
    const shopify = await shopifyOrderProvider.findExistingCustomer({
      email: input.email,
      phone: input.phone,
    });
    if (!shopify) return null;

    const shopifyName = [shopify.first_name, shopify.last_name].filter(Boolean).join(" ").trim();
    const shopifyEmail = shopify.email?.trim().toLowerCase() || null;
    const shopifyPhone = shopify.phone || input.phone || null;

    let customerId: string | null = null;
    if (shopifyEmail) {
      const em = await prisma.emailChannel.findUnique({ where: { externalId: shopifyEmail } });
      if (em) customerId = em.customerId;
    }
    if (!customerId && shopifyPhone) {
      const digits = shopifyPhone.replace(/\D/g, "");
      const wa = await prisma.whatsAppChannel.findFirst({
        where: {
          OR: [
            { externalId: digits },
            { externalId: { contains: digits.slice(-10) } },
          ],
        },
      });
      if (wa) customerId = wa.customerId;
    }

    if (!customerId) {
      const byMeta = await prisma.customer.findFirst({
        where: {
          metadata: {
            path: ["shopifyCustomerId"],
            equals: String(shopify.id),
          },
        },
      });
      if (byMeta) customerId = byMeta.id;
    }

    let createdLocal = false;
    if (!customerId) {
      const created = await prisma.customer.create({
        data: {
          id: ulid(),
          name: shopifyName || input.name || null,
          resolved: false,
          metadata: {
            shopifyCustomerId: String(shopify.id),
            shopifySyncedAt: new Date().toISOString(),
          },
        },
      });
      customerId = created.id;
      createdLocal = true;
    } else {
      const existing = await prisma.customer.findUnique({ where: { id: customerId } });
      if (existing) {
        const meta =
          existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
            ? { ...(existing.metadata as Record<string, unknown>) }
            : {};
        meta.shopifyCustomerId = String(shopify.id);
        meta.shopifySyncedAt = new Date().toISOString();
        delete meta.shopifyCreated;
        const nextName =
          !existing.name || existing.name === "Unknown"
            ? shopifyName || input.name || existing.name
            : existing.name;
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            name: nextName,
            metadata: meta as import("../../generated/client/index.js").Prisma.InputJsonValue,
          },
        });
      }
    }

    if (shopifyEmail) {
      const em = await prisma.emailChannel.findUnique({ where: { externalId: shopifyEmail } });
      if (!em) {
        await prisma.emailChannel.create({
          data: {
            id: ulid(),
            customerId,
            externalId: shopifyEmail,
            resolved: true,
            metadata: { source: "shopify" },
          },
        });
      }
    }

    await recomputeCustomerResolved(customerId);
    console.log(
      `[shopify] read-only match customer=${customerId} shopify=${shopify.id} localNew=${createdLocal}`,
    );
    return {
      customerId,
      created: createdLocal,
      shopifyCustomerId: String(shopify.id),
    };
  } catch (err) {
    console.warn("[shopify] enrich failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** @deprecated use enrichCustomerFromShopify */
export async function enrichContactFromShopify(contactId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { id: contactId },
    include: { emailIdentities: true, whatsappIdentities: true },
  });
  if (!customer) return;
  await enrichCustomerFromShopify({
    name: customer.name,
    email: customer.emailIdentities[0]?.externalId,
    phone: customer.whatsappIdentities[0]?.externalId,
  });
}
