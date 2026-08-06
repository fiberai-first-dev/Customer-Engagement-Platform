import { prisma } from "../config/db.js";
import {
  contactIdentifiersFromRow,
  contactToIdentities,
} from "../services/MessagingService.js";

type ChannelStatus = "open" | "pending" | "resolved";

function isActiveChannelStatus(status: string): boolean {
  return status === "open" || status === "pending";
}

function shapeConversation<T extends {
  id: string;
  contactId: string;
  status: string;
  inbox: { id: string; name: string; channelType: string };
  contact: Parameters<typeof contactToIdentities>[0];
}>(conversation: T) {
  const { inbox, contact, ...rest } = conversation;
  const identities = contactToIdentities(contact);
  return {
    ...rest,
    channelType: inbox.channelType as "whatsapp" | "instagram" | "email",
    inbox: { id: inbox.id, name: inbox.name, channelType: inbox.channelType },
    contact: {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      identifiers: contactIdentifiersFromRow(contact),
      identities: identities.map((identity) => ({
        id: identity.id,
        channel: identity.channel,
        externalId: identity.externalId,
        metadata: identity.metadata,
        enabled: identity.enabled,
      })),
    },
  };
}

type ShapedConversation = ReturnType<typeof shapeConversation>;

/**
 * Status is stored per channel conversation. Enrich contact with a derived
 * globalStatus: "active" if ANY channel is open/pending, else "resolved".
 */
function withContactGlobalStatus(conversations: ShapedConversation[]) {
  const byContact = new Map<string, ShapedConversation[]>();
  for (const conversation of conversations) {
    const list = byContact.get(conversation.contactId) ?? [];
    list.push(conversation);
    byContact.set(conversation.contactId, list);
  }

  const globalByContact = new Map<
    string,
    {
      globalStatus: "active" | "resolved";
      channelStatuses: Partial<Record<"whatsapp" | "instagram" | "email", ChannelStatus>>;
    }
  >();

  for (const [contactId, rows] of byContact) {
    const channelStatuses: Partial<
      Record<"whatsapp" | "instagram" | "email", ChannelStatus>
    > = {};
    for (const row of rows) {
      const channel = row.channelType as "whatsapp" | "instagram" | "email";
      channelStatuses[channel] = row.status as ChannelStatus;
    }
    globalByContact.set(contactId, {
      globalStatus: rows.some((r) => isActiveChannelStatus(r.status))
        ? "active"
        : "resolved",
      channelStatuses,
    });
  }

  return conversations.map((conversation) => {
    const derived = globalByContact.get(conversation.contactId)!;
    return {
      ...conversation,
      contact: {
        ...conversation.contact,
        globalStatus: derived.globalStatus,
        channelStatuses: derived.channelStatuses,
      },
    };
  });
}

export class ConversationRepository {
  static async findMany(filters: {
    accountId?: string;
    inboxId?: string;
    status?: string;
  }) {
    const conversations = await prisma.conversation.findMany({
      where: {
        accountId: filters.accountId || undefined,
        inboxId: filters.inboxId || undefined,
        // Channel-level filter only when an explicit conversation status is requested.
        status:
          filters.status === "open" ||
          filters.status === "pending" ||
          filters.status === "resolved"
            ? filters.status
            : undefined,
      },
      include: {
        inbox: { select: { id: true, name: true, channelType: true } },
        contact: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    return withContactGlobalStatus(conversations.map(shapeConversation));
  }

  static async findById(id: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        inbox: { select: { id: true, name: true, channelType: true } },
        contact: true,
      },
    });
    if (!conversation) return null;

    // Include sibling channel conversations so globalStatus is accurate.
    const siblings = await prisma.conversation.findMany({
      where: { contactId: conversation.contactId },
      include: {
        inbox: { select: { id: true, name: true, channelType: true } },
        contact: true,
      },
    });
    const enriched = withContactGlobalStatus(siblings.map(shapeConversation));
    return enriched.find((c) => c.id === id) ?? null;
  }

  /** Persists channel conversation status only — never a contact-level column. */
  static updateStatus(id: string, status: "open" | "pending" | "resolved") {
    return prisma.conversation.update({
      where: { id },
      data: { status },
    });
  }
}
