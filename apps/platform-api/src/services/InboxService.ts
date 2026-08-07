import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { mergeChannelConfig } from "./MessagingService.js";
import type { ChannelType, Prisma } from "../generated/client/index.js";

function shapeChannelConfig(row: {
  id: string;
  name: string;
  channelType: ChannelType;
  channelConfig: Prisma.JsonValue;
  enabled: boolean;
}) {
  const base = env.publicBaseUrl.replace(/\/$/, "");
  return {
    id: row.id,
    accountId: "workspace",
    name: row.name,
    channelType: row.channelType,
    channelConfig: row.channelConfig,
    enabled: row.enabled,
    webhookUrl: `${base}/webhooks/${row.channelType}`,
  };
}

export class InboxService {
  static async listByAccount(_accountId?: string) {
    const rows = await prisma.channelConfig.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(shapeChannelConfig);
  }

  static async getById(id: string) {
    const row = await prisma.channelConfig.findUnique({ where: { id } });
    return row ? shapeChannelConfig(row) : null;
  }

  static async update(
    id: string,
    data: {
      name?: string;
      channelConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
  ) {
    const existing = await prisma.channelConfig.findUnique({ where: { id } });
    if (!existing) throw new Error("not found");
    const nextConfig =
      data.channelConfig !== undefined
        ? mergeChannelConfig(existing.channelConfig, data.channelConfig)
        : undefined;
    const row = await prisma.channelConfig.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(nextConfig !== undefined ? { channelConfig: nextConfig } : {}),
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      },
    });
    return shapeChannelConfig(row);
  }

  static async updateByChannelType(
    channelType: ChannelType,
    data: {
      name?: string;
      channelConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
  ) {
    const existing = await prisma.channelConfig.findFirst({ where: { channelType } });
    if (!existing) throw new Error("not found");
    return this.update(existing.id, data);
  }
}
