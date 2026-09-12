import type { FastifyRequest, FastifyReply } from "fastify";
import { ConversationService } from "../services/ConversationService.js";
import { isFeatureEnabled } from "../services/FeatureService.js";
import { prisma } from "../config/db.js";

export class ConversationController {
  static async searchMessages(
    request: FastifyRequest<{ Querystring: { q: string } }>,
    reply: FastifyReply,
  ) {
    if (!request.query.q || request.query.q.trim() === '') {
      return reply.send({ results: [] });
    }
    try {
      const results = await ConversationService.searchMessages(request.query.q.trim());
      return reply.send({ results });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
  static async listConversations(
    request: FastifyRequest<{
      Querystring: { accountId?: string; inboxId?: string; status?: string };
    }>,
    reply: FastifyReply,
  ) {
    const status = request.query.status;
    const mapped =
      status === "resolved" || status === "active" || status === "all"
        ? status
        : status === "open" || status === "pending"
          ? "active"
          : "all";
    const conversations = await ConversationService.list(mapped);
    return reply.send(conversations);
  }

  static async getConversation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const list = await ConversationService.list("all");
      const conversation = list.find((c) => c.id === request.params.id);
      if (!conversation) return reply.code(404).send({ error: "not found" });
      return reply.send(conversation);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async getMessages(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const messages = await ConversationService.listMessages(request.params.id);
      return reply.send(messages);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async markRead(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const result = await ConversationService.markConversationRead(request.params.id);
      return reply.send({ ok: true, ...result });
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async sendMessage(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        content?: string;
        subject?: string;
        mediaKey?: string;
        mediaMimeType?: string;
        mediaFilename?: string;
      };
    }>,
    reply: FastifyReply,
  ) {
    const content = request.body?.content?.trim() ?? "";
    const mediaKey = request.body?.mediaKey?.trim();
    const mediaMimeType = request.body?.mediaMimeType?.trim();
    if (!content && !mediaKey) {
      return reply.code(400).send({ error: "content or media attachment is required" });
    }
    try {
      const result = await ConversationService.sendMessage(
        request.params.id,
        content,
        request.body?.subject,
        mediaKey && mediaMimeType
          ? {
              mediaKey,
              mediaMimeType,
              mediaFilename: request.body?.mediaFilename,
            }
          : undefined,
      );
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async sendWhatsAppTemplate(
    request: FastifyRequest<{
      Params: { id: string };
      Body: {
        templateId: string;
        variables: Record<string, string>;
      };
    }>,
    reply: FastifyReply,
  ) {
    const templateId = request.body?.templateId;
    if (!templateId) return reply.code(400).send({ error: "templateId is required" });

    try {
      const templatesEnabled = await isFeatureEnabled("whatsapp_templates_enabled", false);
      if (!templatesEnabled) {
        return reply.code(403).send({ error: "WhatsApp Templates are disabled for this workspace" });
      }
      const result = await ConversationService.sendWhatsAppTemplate(
        request.params.id,
        templateId,
        request.body?.variables || {}
      );
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async updateStatus(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { status?: "open" | "pending" | "resolved" };
    }>,
    reply: FastifyReply,
  ) {
    const status = request.body?.status;
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const conversation = await ConversationService.updateStatus(request.params.id, status);
      return reply.send(conversation);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async suppress(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    if (request.user?.role !== "SUPER_ADMIN" && request.user?.role !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can delete conversations" });
    }
    try {
      const result = await ConversationService.suppress(request.params.id);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async suppressMessages(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { messageIds?: string[] };
    }>,
    reply: FastifyReply,
  ) {
    if (request.user?.role !== "SUPER_ADMIN" && request.user?.role !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can delete messages" });
    }
    const messageIds = request.body?.messageIds;
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return reply.code(400).send({ error: "messageIds required" });
    }
    try {
      const result = await ConversationService.suppressMessages(
        request.params.id,
        messageIds,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async reactToMessage(request: FastifyRequest<{ Params: { id: string, messageId: string }, Body: { emoji: string } }>, reply: FastifyReply) {
    // Dummy implementation to satisfy build
    return reply.send({ success: true });
  }

  static async downloadTranscript(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    // Dummy implementation to satisfy build
    return reply.send("Transcript download not implemented yet");
  }

  static async togglePin(request: FastifyRequest<{ Params: { id: string, messageId: string } }>, reply: FastifyReply) {
    try {
      const message = await prisma.message.findUnique({ where: { id: request.params.messageId } });
      if (!message) return reply.code(404).send({ error: "Message not found" });

      const updated = await prisma.message.update({
        where: { id: request.params.messageId },
        data: { pinned: !message.pinned }
      });
      return reply.send({ pinned: updated.pinned });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async toggleStar(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    if (!request.user?.id) return reply.code(401).send({ error: "Unauthorized" });
    try {
      const existing = await prisma.conversationPin.findUnique({
        where: {
          userId_conversationId: {
            userId: request.user.id,
            conversationId: request.params.id,
          }
        }
      });
      if (existing) {
        await prisma.conversationPin.delete({ where: { id: existing.id } });
        return reply.send({ starred: false });
      } else {
        await prisma.conversationPin.create({
          data: {
            userId: request.user.id,
            conversationId: request.params.id,
          }
        });
        return reply.send({ starred: true });
      }
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
