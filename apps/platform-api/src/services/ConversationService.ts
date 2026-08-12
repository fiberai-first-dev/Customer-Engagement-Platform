import type { ChannelType } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import {
  sendCustomerChannelMessage,
  shapeCustomer,
} from "./MessagingService.js";
import {
  recomputeCustomerResolved,
  resolveAllIdentitiesForCustomerChannel,
} from "./ResolveService.js";
import { suppressConversation, suppressMessages as suppressSelectedMessages } from "./SuppressService.js";

function previewMessage(content: string) {
  return content.length > 120 ? `${content.slice(0, 117)}…` : content;
}

/**
 * Synthesize conversation-like rows for the existing Inbox UI.
 * One "conversation" per (customer, channelType) using the most recent identity.
 */
export class ConversationService {
  static async list(status?: "active" | "resolved" | "all") {
    const enabledConfigs = await prisma.channelConfig.findMany({
      where: { enabled: true },
    });
    const enabledTypes = new Set(enabledConfigs.map((c) => c.channelType));

    const customers = await prisma.customer.findMany({
      include: {
        whatsappIdentities: true,
        instagramIdentities: true,
        emailIdentities: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const rows = [];
    for (const customer of customers) {
      const shaped = shapeCustomer(customer);
      const channelStatuses: Partial<Record<ChannelType, "open" | "resolved">> = {};

      // Pre-compute statuses for all enabled channels that have *messaged* identities
      for (const type of ["whatsapp", "instagram", "email"] as ChannelType[]) {
        if (!enabledTypes.has(type)) continue;
        const identities =
          type === "whatsapp"
            ? customer.whatsappIdentities
            : type === "instagram"
              ? customer.instagramIdentities
              : customer.emailIdentities;
        const active = identities.filter((i) => i.lastMessageAt != null);
        if (!active.length) continue;
        const unresolved = active.some((i) => !i.resolved);
        channelStatuses[type] = unresolved ? "open" : "resolved";
      }

      for (const type of ["whatsapp", "instagram", "email"] as ChannelType[]) {
        if (!enabledTypes.has(type)) continue;
        const identities =
          type === "whatsapp"
            ? customer.whatsappIdentities
            : type === "instagram"
              ? customer.instagramIdentities
              : customer.emailIdentities;
        // Shopify / contact-form ghosts have no lastMessageAt — hide from Inbox.
        const active = identities.filter((i) => i.lastMessageAt != null);
        if (!active.length) continue;

        const unresolved = active.some((i) => !i.resolved);
        // Filter by per-channel status (not only global customer.resolved)
        if (status === "active" && !unresolved) continue;
        if (status === "resolved" && unresolved) continue;

        const latest = [...active].sort((a, b) => {
          const at = a.lastMessageAt?.getTime() ?? 0;
          const bt = b.lastMessageAt?.getTime() ?? 0;
          return bt - at;
        })[0]!;

        const lastMsg = await prisma.message.findFirst({
          where: { customerId: customer.id, channelType: type },
          orderBy: { createdAt: "desc" },
        });

        rows.push({
          id: `${customer.id}:${type}`,
          contactId: customer.id,
          accountId: "workspace",
          status: unresolved ? ("open" as const) : ("resolved" as const),
          lastMessageAt: latest.lastMessageAt ?? lastMsg?.createdAt ?? null,
          channelType: type,
          inbox: {
            id: `channel_${type}`,
            name: type === "whatsapp" ? "WhatsApp" : type === "instagram" ? "Instagram" : "Email",
            channelType: type,
          },
          contact: {
            ...shaped,
            channelStatuses,
            globalStatus: Object.values(channelStatuses).some((s) => s === "open")
              ? ("active" as const)
              : ("resolved" as const),
          },
          messages: lastMsg
            ? [
                {
                  id: lastMsg.id,
                  conversationId: `${customer.id}:${type}`,
                  direction: lastMsg.direction,
                  content: previewMessage(lastMsg.content),
                  contentType: lastMsg.contentType,
                  subject: lastMsg.subject,
                  status: lastMsg.status,
                  createdAt: lastMsg.createdAt.toISOString(),
                },
              ]
            : [],
        });
      }
    }

    rows.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

    return rows;
  }

  static parseConversationId(id: string): { customerId: string; channelType: ChannelType } {
    const [customerId, channelType] = id.split(":");
    if (!customerId || !["whatsapp", "instagram", "email"].includes(channelType ?? "")) {
      throw new Error("invalid conversation id");
    }
    return { customerId, channelType: channelType as ChannelType };
  }

  static async listMessages(conversationId: string) {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    const messages = await prisma.message.findMany({
      where: { customerId, channelType },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return messages.map((m) => ({
      id: m.id,
      conversationId,
      direction: m.direction,
      content: m.content,
      contentType: m.contentType,
      subject: m.subject,
      status: m.status,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  static async sendMessage(conversationId: string, content: string, subject?: string) {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    const result = await sendCustomerChannelMessage({
      customerId,
      channelType,
      content,
      subject,
    });
    return {
      message: result.message
        ? {
            id: result.message.id,
            conversationId,
            direction: result.message.direction,
            content: result.message.content,
            contentType: result.message.contentType,
            subject: result.message.subject,
            status: result.message.status,
            createdAt: result.message.createdAt.toISOString(),
          }
        : null,
      result: result.result,
    };
  }

  static async updateStatus(conversationId: string, status: "open" | "pending" | "resolved") {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    if (status === "resolved") {
      await resolveAllIdentitiesForCustomerChannel({ customerId, channelType });
    } else {
      // Mark every identity of this channel type unresolved
      if (channelType === "whatsapp") {
        await prisma.whatsAppChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else if (channelType === "instagram") {
        await prisma.instagramChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      } else {
        await prisma.emailChannel.updateMany({
          where: { customerId },
          data: { resolved: false },
        });
      }
      await recomputeCustomerResolved(customerId);
    }

    const list = await this.list("all");
    const found = list.find((r) => r.id === conversationId);
    if (!found) throw new Error("Conversation not found");
    return found;
  }

  /** Delete messages + tombstone external ids so providers cannot resurrect them. */
  static async suppress(conversationId: string) {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    const result = await suppressConversation({ customerId, channelType });
    return { ok: true, conversationId, ...result };
  }

  /** Delete selected messages in a thread (tombstone external ids). */
  static async suppressMessages(conversationId: string, messageIds: string[]) {
    const { customerId, channelType } = this.parseConversationId(conversationId);
    const result = await suppressSelectedMessages({ customerId, channelType, messageIds });
    return { ok: true, conversationId, ...result };
  }
}
