import { ulid } from "ulid";
import { InboxRepository } from "../repositories/InboxRepository.js";
import { AccountRepository } from "../repositories/AccountRepository.js";
import { env } from "../config/env.js";
import { redactConfig, mergeChannelConfig } from "./MessagingService.js";
import type { ChannelType, Prisma } from "../generated/client/index.js";

const channelTypes: ChannelType[] = ["whatsapp", "instagram", "email"];

export class InboxService {
  static toPublic(inbox: {
    id: string;
    accountId: string;
    name: string;
    channelType: ChannelType;
    channelConfig: Prisma.JsonValue;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...inbox,
      channelConfig: redactConfig(inbox.channelConfig),
      webhookUrl: `${env.publicBaseUrl}/webhooks/${inbox.channelType}/${inbox.id}`,
    };
  }

  static async listInboxes(accountId: string) {
    const inboxes = await InboxRepository.findByAccountId(accountId);
    return inboxes.map((inbox) => InboxService.toPublic(inbox));
  }

  static async createInbox(
    accountId: string,
    data: {
      name?: string;
      channelType?: string;
      channelConfig?: Record<string, unknown>;
      enabled?: boolean;
    },
  ) {
    const { name, channelType, channelConfig, enabled } = data;
    if (!channelType || !channelTypes.includes(channelType as ChannelType)) {
      throw new Error("channelType must be whatsapp|instagram|email");
    }
    const account = await AccountRepository.findById(accountId);
    if (!account) throw new Error("account not found");

    const inbox = await InboxRepository.create({
      id: ulid(),
      accountId: account.id,
      name: name?.trim() || `${channelType} inbox`,
      channelType: channelType as ChannelType,
      channelConfig: (channelConfig ?? {}) as Prisma.InputJsonValue,
      enabled: enabled ?? true,
    });

    return InboxService.toPublic(inbox);
  }

  static async updateInbox(
    inboxId: string,
    data: {
      name?: string;
      enabled?: boolean;
      channelConfig?: Record<string, unknown>;
    },
  ) {
    const existing = await InboxRepository.findById(inboxId);
    if (!existing) throw new Error("inbox not found");

    const nextConfig =
      data.channelConfig !== undefined
        ? mergeChannelConfig(existing.channelConfig, data.channelConfig)
        : undefined;

    const inbox = await InboxRepository.update(inboxId, {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(nextConfig !== undefined ? { channelConfig: nextConfig } : {}),
    });

    return InboxService.toPublic(inbox);
  }
}
