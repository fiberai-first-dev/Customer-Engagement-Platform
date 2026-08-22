import type { FastifyRequest, FastifyReply } from "fastify";
import { ConversationService } from "../services/ConversationService.js";

export class ConversationController {
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
}
