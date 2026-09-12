import type { FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { prisma } from "../config/db.js";
import { broadcastToUI } from "../services/WebsocketService.js";

export class WebChatController {
  static async createSession(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as { name?: string; email?: string; externalId?: string };
      let externalId = body.externalId;

      if (!externalId) {
        externalId = randomUUID();
      }

      let webChatChannel = await prisma.webChatChannel.findUnique({
        where: { externalId },
        include: { customer: true }
      });

      if (!webChatChannel) {
        const customer = await prisma.customer.create({
          data: {
            id: randomUUID(),
            name: body.name || "Web Visitor",
            webChatIdentities: {
              create: {
                id: randomUUID(),
                externalId
              }
            }
          },
          include: { webChatIdentities: true }
        });
        webChatChannel = customer.webChatIdentities[0];
      } else if (body.name && webChatChannel.customer.name !== body.name) {
        await prisma.customer.update({
          where: { id: webChatChannel.customerId },
          data: { name: body.name }
        });
      }

      return reply.send({ externalId, customerId: webChatChannel.customerId, channelId: webChatChannel.id });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async sendMessage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { externalId, content } = request.body as { externalId: string; content: string };
      if (!externalId || !content) return reply.code(400).send({ error: "Missing required fields" });

      const channel = await prisma.webChatChannel.findUnique({ where: { externalId } });
      if (!channel) return reply.code(404).send({ error: "Session not found" });

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          channelType: "web_chat",
          channelId: channel.id,
          customerId: channel.customerId,
          direction: "incoming",
          content,
          status: "delivered",
        }
      });

      await prisma.webChatChannel.update({
        where: { id: channel.id },
        data: { lastMessageAt: new Date(), lastCustomerMessageAt: new Date(), resolved: false }
      });

      broadcastToUI("message.created", message);

      return reply.send(message);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async getMessages(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { externalId } = request.query as { externalId: string };
      if (!externalId) return reply.code(400).send({ error: "Missing externalId" });

      const channel = await prisma.webChatChannel.findUnique({ where: { externalId } });
      if (!channel) return reply.code(404).send({ error: "Session not found" });

      const messages = await prisma.message.findMany({
        where: { channelType: "web_chat", channelId: channel.id },
        orderBy: { createdAt: "asc" }
      });

      return reply.send(messages);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
