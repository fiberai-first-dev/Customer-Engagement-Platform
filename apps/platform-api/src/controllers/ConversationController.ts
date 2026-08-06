import type { FastifyRequest, FastifyReply } from "fastify";
import { ConversationService } from "../services/ConversationService.js";

export class ConversationController {
  static async listConversations(
    request: FastifyRequest<{
      Querystring: { accountId?: string; inboxId?: string; status?: string };
    }>,
    reply: FastifyReply,
  ) {
    const conversations = await ConversationService.listConversations(request.query);
    return reply.send(conversations);
  }

  static async getConversation(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const conversation = await ConversationService.getConversation(request.params.id);
      return reply.send(conversation);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async getMessages(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const messages = await ConversationService.getMessages(request.params.id);
      return reply.send(messages);
    } catch (err: any) {
      return reply.code(404).send({ error: err.message });
    }
  }

  static async sendMessage(request: FastifyRequest<{ Params: { id: string }; Body: { content?: string; subject?: string } }>, reply: FastifyReply) {
    const content = request.body?.content?.trim();
    if (!content) return reply.code(400).send({ error: "content is required" });
    try {
      const result = await ConversationService.sendMessage(request.params.id, content, request.body?.subject);
      
      // Even if the transmission failed (result.result.ok === false), the message was still 
      // successfully created in our database with status='failed'. 
      // We return 201 so the frontend can display the failed message rather than crashing.
      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async updateStatus(request: FastifyRequest<{ Params: { id: string }; Body: { status?: "open" | "pending" | "resolved" } }>, reply: FastifyReply) {
    const status = request.body?.status;
    if (!status) return reply.code(400).send({ error: "status is required" });
    try {
      const conversation = await ConversationService.updateStatus(request.params.id, status);
      return reply.send(conversation);
    } catch (err: any) {
      if (err.message === "invalid status") return reply.code(400).send({ error: err.message });
      return reply.code(404).send({ error: err.message });
    }
  }
}
