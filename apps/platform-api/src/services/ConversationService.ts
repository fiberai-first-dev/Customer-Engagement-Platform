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
import {
  suppressConversation,
  suppressMessages as suppressSelectedMessages,
} from "./SuppressService.js";
import {
  buildConversationId,
  displayEmailSubject,
  parseConversationId,
} from "../utils/conversationId.js";

function previewMessage(content: string) {
  return content.length > 120 ? `${content.slice(0, 117)}…` : content;
}

function shapeMessage(
  conversationId: string,
  m: {
    id: string;
    direction: string;
    content: string;
    contentType: string;
    subject: string | null;
    status: string;
    createdAt: Date;
    externalThreadId?: string | null;
    isRead?: boolean;
    mediaKey?: string | null;
    mediaMimeType?: string | null;
    mediaFilename?: string | null;
  },
) {
  return {
    id: m.id,
    conversationId,
    direction: m.direction,
    content: previewMessage(m.content),
    contentType: m.contentType,
    subject: m.subject,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    externalThreadId: m.externalThreadId ?? null,
    isRead: m.isRead ?? m.direction === "outgoing",
    hasMedia: Boolean(m.mediaKey),
    mediaFilename: m.mediaFilename ?? null,
    mediaMimeType: m.mediaMimeType ?? null,
  };
}

function fullShapeMessage(
  conversationId: string,
  m: {
    id: string;
    direction: string;
    content: string;
    contentType: string;
    subject: string | null;
    status: string;
    createdAt: Date;
    externalThreadId?: string | null;
    isRead?: boolean;
    mediaKey?: string | null;
    mediaMimeType?: string | null;
    mediaFilename?: string | null;
  },
) {
  return {
    id: m.id,
    conversationId,
    direction: m.direction,
    content: m.content,
    contentType: m.contentType,
    subject: m.subject,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    externalThreadId: m.externalThreadId ?? null,
    isRead: m.isRead ?? m.direction === "outgoing",
    hasMedia: Boolean(m.mediaKey),
    mediaFilename: m.mediaFilename ?? null,
    mediaMimeType: m.mediaMimeType ?? null,
  };
}

async function loadUnreadMap() {
  const rows = await prisma.message.groupBy({
    by: ["customerId", "channelType"],
    where: { direction: "incoming", isRead: false },
    _count: { id: true },
  });
  const map = new Map<string, Partial<Record<ChannelType, number>>>();
  for (const row of rows) {
    const prev = map.get(row.customerId) ?? {};
    prev[row.channelType] = row._count.id;
    map.set(row.customerId, prev);
  }
  return map;
}

function contactHasUnread(
  customerId: string,
  unreadMap: Map<string, Partial<Record<ChannelType, number>>>,
  channelFilter?: ChannelType,
): boolean {
  const counts = unreadMap.get(customerId);
  if (!counts) return false;
  if (channelFilter) return (counts[channelFilter] ?? 0) > 0;
  return Object.values(counts).some((n) => (n ?? 0) > 0);
}

/**
 * Synthesize conversation-like rows for the Inbox UI.
 * WhatsApp / Instagram: one row per (customer, channel).
 * Email: one row per Gmail thread under the customer.
 */
export class ConversationService {
  static parseConversationId = parseConversationId;

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

    const unreadMap = await loadUnreadMap();

    const rows = [];
    for (const customer of customers) {
      const shaped = shapeCustomer(customer);
      const channelStatuses: Partial<Record<ChannelType, "open" | "resolved">> = {};

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
        const active = identities.filter((i) => i.lastMessageAt != null);
        if (!active.length) continue;

        const unresolved = active.some((i) => !i.resolved);
        if (status === "active" && !unresolved) continue;
        if (status === "resolved" && unresolved) continue;

        const contactBase = {
          ...shaped,
          channelStatuses,
          globalStatus: Object.values(channelStatuses).some((s) => s === "open")
            ? ("active" as const)
            : ("resolved" as const),
          hasUnread: contactHasUnread(customer.id, unreadMap),
          unreadByChannel: unreadMap.get(customer.id) ?? {},
        };

        const inboxMeta = {
          id: `channel_${type}`,
          name: type === "whatsapp" ? "WhatsApp" : type === "instagram" ? "Instagram" : "Email",
          channelType: type,
        };

        if (type !== "email") {
          const latest = [...active].sort((a, b) => {
            const at = a.lastMessageAt?.getTime() ?? 0;
            const bt = b.lastMessageAt?.getTime() ?? 0;
            return bt - at;
          })[0]!;

          const lastMsg = await prisma.message.findFirst({
            where: { customerId: customer.id, channelType: type },
            orderBy: { createdAt: "desc" },
          });

          const conversationId = buildConversationId(customer.id, type);
          rows.push({
            id: conversationId,
            contactId: customer.id,
            accountId: "workspace",
            status: unresolved ? ("open" as const) : ("resolved" as const),
            lastMessageAt: lastMsg?.createdAt ?? latest.lastMessageAt ?? null,
            channelType: type,
            externalThreadId: null as string | null,
            threadSubject: null as string | null,
            hasUnread: (unreadMap.get(customer.id)?.[type] ?? 0) > 0,
            inbox: inboxMeta,
            contact: contactBase,
            messages: lastMsg ? [shapeMessage(conversationId, lastMsg)] : [],
          });
          continue;
        }

        // One inbox row per Gmail thread
        const emailMessages = await prisma.message.findMany({
          where: { customerId: customer.id, channelType: "email" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            direction: true,
            content: true,
            contentType: true,
            subject: true,
            status: true,
            createdAt: true,
            externalThreadId: true,
          },
        });

        const byThread = new Map<string, typeof emailMessages>();
        for (const msg of emailMessages) {
          const threadKey = msg.externalThreadId || `legacy:${customer.id}`;
          const list = byThread.get(threadKey);
          if (list) list.push(msg);
          else byThread.set(threadKey, [msg]);
        }

        for (const [threadId, threadMsgs] of byThread) {
          // threadMsgs are newest-first from the query order
          const lastMsg = threadMsgs[0]!;
          const oldestWithSubject = [...threadMsgs]
            .reverse()
            .find((m) => m.subject?.trim());
          const conversationId = buildConversationId(customer.id, "email", threadId);
          rows.push({
            id: conversationId,
            contactId: customer.id,
            accountId: "workspace",
            status: unresolved ? ("open" as const) : ("resolved" as const),
            lastMessageAt: lastMsg.createdAt,
            channelType: "email" as const,
            externalThreadId: threadId,
            threadSubject: displayEmailSubject(
              oldestWithSubject?.subject ?? lastMsg.subject,
            ),
            hasUnread: (unreadMap.get(customer.id)?.email ?? 0) > 0,
            inbox: inboxMeta,
            contact: contactBase,
            messages: [shapeMessage(conversationId, lastMsg)],
          });
        }
      }
    }

    rows.sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });

    return rows;
  }

  static async listMessages(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);

    if (isNewEmailThread) return [];

    const messages = await prisma.message.findMany({
      where: {
        customerId,
        channelType,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    await prisma.message.updateMany({
      where: {
        customerId,
        channelType,
        direction: "incoming",
        isRead: false,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      data: { isRead: true },
    });

    return messages.map((m) => fullShapeMessage(conversationId, m));
  }

  static async markConversationRead(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    if (isNewEmailThread) return { updated: 0 };
    const result = await prisma.message.updateMany({
      where: {
        customerId,
        channelType,
        direction: "incoming",
        isRead: false,
        ...(channelType === "email" && externalThreadId
          ? { externalThreadId }
          : {}),
      },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  static async sendMessage(
    conversationId: string,
    content: string,
    subject?: string,
    media?: { mediaKey: string; mediaMimeType: string; mediaFilename?: string },
  ) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    const result = await sendCustomerChannelMessage({
      customerId,
      channelType,
      content,
      subject,
      externalThreadId,
      isNewEmailThread,
      mediaKey: media?.mediaKey,
      mediaMimeType: media?.mediaMimeType,
      mediaFilename: media?.mediaFilename,
    });

    const resolvedConversationId =
      channelType === "email" && result.externalThreadId
        ? buildConversationId(customerId, "email", result.externalThreadId)
        : buildConversationId(customerId, channelType, externalThreadId);

    return {
      conversationId: resolvedConversationId,
      message: result.message
        ? {
            id: result.message.id,
            conversationId: resolvedConversationId,
            direction: result.message.direction,
            content: result.message.content,
            contentType: result.message.contentType,
            subject: result.message.subject,
            status: result.message.status,
            createdAt: result.message.createdAt.toISOString(),
            externalThreadId: result.message.externalThreadId ?? null,
            isRead: true,
            hasMedia: Boolean(result.message.mediaKey),
            mediaFilename: result.message.mediaFilename ?? null,
            mediaMimeType: result.message.mediaMimeType ?? null,
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
    const found =
      list.find((r) => r.id === conversationId) ??
      list.find((r) => r.contactId === customerId && r.channelType === channelType);
    if (!found) throw new Error("Conversation not found");
    return found;
  }

  /** Delete messages + tombstone external ids so providers cannot resurrect them. */
  static async suppress(conversationId: string) {
    const { customerId, channelType, externalThreadId, isNewEmailThread } =
      this.parseConversationId(conversationId);
    if (isNewEmailThread) {
      return { ok: true, conversationId, suppressed: 0, deletedMessages: 0 };
    }
    const result = await suppressConversation({
      customerId,
      channelType,
      externalThreadId,
    });
    return { ok: true, conversationId, ...result };
  }

  /** Delete selected messages in a thread (tombstone external ids). */
  static async suppressMessages(conversationId: string, messageIds: string[]) {
    const { customerId, channelType, externalThreadId } =
      this.parseConversationId(conversationId);
    const result = await suppressSelectedMessages({
      customerId,
      channelType,
      messageIds,
      externalThreadId,
    });
    return { ok: true, conversationId, ...result };
  }
}
