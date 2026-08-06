import { ulid } from "ulid";
import { AccountRepository } from "../repositories/AccountRepository.js";
import { InboxRepository } from "../repositories/InboxRepository.js";
import { mergeChannelConfig } from "./MessagingService.js";
import type { ChannelType, Prisma } from "../generated/client/index.js";
import { env } from "../config/env.js";

export class AccountService {
  static async createAccount(name?: string) {
    const safeName = name?.trim() || "Default Account";
    return AccountRepository.create({ id: ulid(), name: safeName });
  }

  static async listAccounts() {
    return AccountRepository.findAll();
  }

  /**
   * Compatibility API: upsert the account's inbox for a channel and patch config/enabled.
   * Prefer Inbox APIs for new clients.
   */
  static async updateChannel(
    accountId: string,
    channel: ChannelType,
    patch: { enabled?: boolean; config?: Record<string, unknown>; name?: string },
  ) {
    const account = await AccountRepository.findById(accountId);
    if (!account) throw new Error("Account not found");

    let inbox = await InboxRepository.findByAccountAndChannel(accountId, channel);
    if (!inbox) {
      inbox = await InboxRepository.create({
        id: ulid(),
        accountId,
        name: patch.name?.trim() || `${channel[0]!.toUpperCase()}${channel.slice(1)}`,
        channelType: channel,
        channelConfig: (patch.config ?? {}) as Prisma.InputJsonValue,
        enabled: patch.enabled ?? true,
      });
    } else {
      const nextConfig =
        patch.config !== undefined
          ? mergeChannelConfig(inbox.channelConfig, patch.config)
          : undefined;
      inbox = await InboxRepository.update(inbox.id, {
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(nextConfig !== undefined ? { channelConfig: nextConfig } : {}),
      });
    }

    return {
      ...inbox,
      channelConfig: inbox.channelConfig,
      webhookUrl: `${env.publicBaseUrl.replace(/\/$/, "")}/webhooks/${inbox.channelType}`,
    };
  }
}
