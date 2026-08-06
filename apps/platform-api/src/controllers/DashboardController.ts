import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

export class DashboardController {
  static async getMetrics(
    request: FastifyRequest<{ Querystring: { accountId?: string } }>,
    reply: FastifyReply,
  ) {
    const { accountId } = request.query;
    const where = accountId ? { accountId } : undefined;

    try {
      const [totalMessages, activeContacts, recentConversations, channelRows] =
        await Promise.all([
          prisma.message.count({
            where: where ? { conversation: { accountId: where.accountId } } : undefined,
          }),
          prisma.contact.count({ where }),
          prisma.conversation.findMany({
            where,
            orderBy: { lastMessageAt: "desc" },
            take: 4,
            include: {
              contact: true,
              inbox: { select: { channelType: true } },
              messages: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          }),
          prisma.conversation.findMany({
            where,
            select: { inbox: { select: { channelType: true } } },
          }),
        ]);

      const recentActivity = recentConversations.map((c) => ({
        id: c.id,
        contactName: c.contact.name || c.contact.phone || c.contact.email || "Unknown",
        initials: (c.contact.name || c.contact.phone || c.contact.email || "U")
          .substring(0, 2)
          .toUpperCase(),
        preview: c.messages[0]?.content || "No messages",
        timestamp: c.lastMessageAt || c.createdAt,
        channelType: c.inbox.channelType,
      }));

      const channelDistribution = channelRows.reduce(
        (acc: Record<string, number>, row) => {
          const key = row.inbox.channelType;
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      return reply.send({
        totalMessages,
        activeContacts,
        recentActivity,
        channelDistribution,
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
