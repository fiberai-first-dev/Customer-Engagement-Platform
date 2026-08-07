import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export class ShopifyConfigController {
  static async get(_request: FastifyRequest, reply: FastifyReply) {
    const row =
      (await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } })) ??
      (await prisma.shopifyConfig.create({
        data: { id: "shopify_default" },
      }));
    return reply.send({
      id: row.id,
      shop: row.shop,
      clientId: row.clientId,
      clientSecret: row.clientSecret ? maskSecret(row.clientSecret) : "",
      clientSecretSet: Boolean(row.clientSecret),
      apiVersion: row.apiVersion,
      updatedAt: row.updatedAt,
    });
  }

  static async update(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      shop?: string;
      clientId?: string;
      clientSecret?: string;
      apiVersion?: string;
    };

    const existing =
      (await prisma.shopifyConfig.findUnique({ where: { id: "shopify_default" } })) ??
      (await prisma.shopifyConfig.create({ data: { id: "shopify_default" } }));

    const secret =
      body.clientSecret && !body.clientSecret.includes("…") && body.clientSecret !== "***"
        ? body.clientSecret.trim()
        : existing.clientSecret;

    const row = await prisma.shopifyConfig.update({
      where: { id: "shopify_default" },
      data: {
        ...(body.shop !== undefined ? { shop: body.shop.trim().replace(/\.myshopify\.com$/i, "") } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId.trim() } : {}),
        clientSecret: secret,
        ...(body.apiVersion !== undefined ? { apiVersion: body.apiVersion.trim() || "2024-10" } : {}),
      },
    });

    return reply.send({
      id: row.id,
      shop: row.shop,
      clientId: row.clientId,
      clientSecret: row.clientSecret ? maskSecret(row.clientSecret) : "",
      clientSecretSet: Boolean(row.clientSecret),
      apiVersion: row.apiVersion,
      updatedAt: row.updatedAt,
    });
  }
}
