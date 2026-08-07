import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

function shape(row: {
  id: string;
  shop: string;
  clientId: string;
  clientSecret: string;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    shop: row.shop,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    updatedAt: row.updatedAt,
  };
}

export class ShopifyConfigController {
  static async get(_request: FastifyRequest, reply: FastifyReply) {
    const row =
      (await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } })) ??
      (await prisma.shopifyConfig.create({
        data: { id: "shopify_default" },
      }));
    return reply.send(shape(row));
  }

  static async update(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      shop?: string;
      clientId?: string;
      clientSecret?: string;
    };

    await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } }) ??
      (await prisma.shopifyConfig.create({ data: { id: "shopify_default" } }));

    const row = await prisma.shopifyConfig.update({
      where: { id: "shopify_default" },
      data: {
        ...(body.shop !== undefined
          ? { shop: body.shop.trim().replace(/\.myshopify\.com$/i, "") }
          : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId.trim() } : {}),
        ...(body.clientSecret !== undefined ? { clientSecret: body.clientSecret.trim() } : {}),
      },
    });

    return reply.send(shape(row));
  }
}
