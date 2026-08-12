import { ulid } from "ulid";
import type { ChannelType } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import { resolveAllIdentitiesForCustomerChannel } from "./ResolveService.js";

export async function isInboundSuppressed(
  channelType: ChannelType,
  externalId: string,
): Promise<boolean> {
  const row = await prisma.suppressedInbound.findUnique({
    where: {
      channelType_externalId: { channelType, externalId },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function suppressInboundIds(input: {
  channelType: ChannelType;
  externalIds: string[];
  customerId?: string;
  reason?: string;
}): Promise<number> {
  let created = 0;
  for (const externalId of [...new Set(input.externalIds.filter(Boolean))]) {
    try {
      await prisma.suppressedInbound.create({
        data: {
          id: ulid(),
          channelType: input.channelType,
          externalId,
          customerId: input.customerId,
          reason: input.reason ?? "dismissed",
        },
      });
      created++;
    } catch {
      // already suppressed
    }
  }
  return created;
}

/**
 * Remove channel messages from CEP and tombstone their external ids so
 * Gmail Pub/Sub / catch-up cannot bring them back.
 */
export async function suppressConversation(input: {
  customerId: string;
  channelType: ChannelType;
  reason?: string;
}): Promise<{ suppressed: number; deletedMessages: number }> {
  const messages = await prisma.message.findMany({
    where: {
      customerId: input.customerId,
      channelType: input.channelType,
    },
    select: { id: true, externalId: true },
  });

  return finalizeMessageSuppression({
    customerId: input.customerId,
    channelType: input.channelType,
    messages,
    reason: input.reason ?? "conversation_dismissed",
    clearChannelActivity: true,
  });
}

/**
 * Delete selected messages in a channel thread and tombstone their external ids.
 * If none remain, clears channel activity like a full clear-chat.
 */
export async function suppressMessages(input: {
  customerId: string;
  channelType: ChannelType;
  messageIds: string[];
  reason?: string;
}): Promise<{ suppressed: number; deletedMessages: number }> {
  const ids = [...new Set(input.messageIds.filter(Boolean))];
  if (!ids.length) {
    throw new Error("messageIds required");
  }

  const messages = await prisma.message.findMany({
    where: {
      customerId: input.customerId,
      channelType: input.channelType,
      id: { in: ids },
    },
    select: { id: true, externalId: true },
  });

  if (!messages.length) {
    throw new Error("No matching messages to delete");
  }

  const remaining = await prisma.message.count({
    where: {
      customerId: input.customerId,
      channelType: input.channelType,
      id: { notIn: messages.map((m) => m.id) },
    },
  });

  const result = await finalizeMessageSuppression({
    customerId: input.customerId,
    channelType: input.channelType,
    messages,
    reason: input.reason ?? "message_deleted",
    clearChannelActivity: remaining === 0,
  });

  if (remaining > 0) {
    const latest = await prisma.message.findFirst({
      where: {
        customerId: input.customerId,
        channelType: input.channelType,
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (latest?.createdAt) {
      await bumpChannelLastMessageAt({
        customerId: input.customerId,
        channelType: input.channelType,
        lastMessageAt: latest.createdAt,
      });
    }
  }

  return result;
}

async function finalizeMessageSuppression(input: {
  customerId: string;
  channelType: ChannelType;
  messages: { id: string; externalId: string | null }[];
  reason: string;
  clearChannelActivity: boolean;
}): Promise<{ suppressed: number; deletedMessages: number }> {
  const externalIds = input.messages
    .map((m) => m.externalId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const suppressed = await suppressInboundIds({
    channelType: input.channelType,
    externalIds,
    customerId: input.customerId,
    reason: input.reason,
  });

  const deleted = await prisma.message.deleteMany({
    where: {
      customerId: input.customerId,
      channelType: input.channelType,
      id: { in: input.messages.map((m) => m.id) },
    },
  });

  if (input.clearChannelActivity) {
    await clearChannelActivity(input.customerId, input.channelType);
    await resolveAllIdentitiesForCustomerChannel({
      customerId: input.customerId,
      channelType: input.channelType,
    });
  }

  return { suppressed, deletedMessages: deleted.count };
}

async function clearChannelActivity(customerId: string, channelType: ChannelType) {
  if (channelType === "whatsapp") {
    await prisma.whatsAppChannel.updateMany({
      where: { customerId },
      data: { lastMessageAt: null, resolved: true },
    });
  } else if (channelType === "instagram") {
    await prisma.instagramChannel.updateMany({
      where: { customerId },
      data: { lastMessageAt: null, resolved: true },
    });
  } else {
    await prisma.emailChannel.updateMany({
      where: { customerId },
      data: { lastMessageAt: null, resolved: true },
    });
  }
}

async function bumpChannelLastMessageAt(input: {
  customerId: string;
  channelType: ChannelType;
  lastMessageAt: Date;
}) {
  if (input.channelType === "whatsapp") {
    await prisma.whatsAppChannel.updateMany({
      where: { customerId: input.customerId },
      data: { lastMessageAt: input.lastMessageAt },
    });
  } else if (input.channelType === "instagram") {
    await prisma.instagramChannel.updateMany({
      where: { customerId: input.customerId },
      data: { lastMessageAt: input.lastMessageAt },
    });
  } else {
    await prisma.emailChannel.updateMany({
      where: { customerId: input.customerId },
      data: { lastMessageAt: input.lastMessageAt },
    });
  }
}
