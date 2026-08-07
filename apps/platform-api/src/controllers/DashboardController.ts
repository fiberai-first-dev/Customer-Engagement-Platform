import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";

export class DashboardController {
  static async getMetrics(
    _request: FastifyRequest<{ Querystring: { accountId?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const [totalMessages, activeContacts, recentMessages, byChannel] =
        await Promise.all([
          prisma.message.count(),
          prisma.customer.count({ where: { resolved: false } }),
          prisma.message.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            distinct: ["customerId", "channelType"],
          }),
          prisma.message.groupBy({
            by: ["channelType"],
            _count: { _all: true },
          }),
        ]);

      const customerIds = [...new Set(recentMessages.map((m) => m.customerId))];
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        include: {
          whatsappIdentities: true,
          instagramIdentities: true,
          emailIdentities: true,
        },
      });
      const byId = new Map(customers.map((c) => [c.id, c]));

      const recentActivity = recentMessages.slice(0, 4).map((m) => {
        const c = byId.get(m.customerId);
        const name =
          c?.name ||
          c?.whatsappIdentities[0]?.externalId ||
          c?.emailIdentities[0]?.externalId ||
          "Unknown";
        return {
          id: `${m.customerId}:${m.channelType}`,
          contactName: name,
          initials: name.substring(0, 2).toUpperCase(),
          preview: m.content || "No messages",
          timestamp: m.createdAt,
          channelType: m.channelType,
        };
      });

      const channelDistribution = byChannel.reduce(
        (acc: Record<string, number>, row) => {
          acc[row.channelType] = row._count._all;
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
