import type { FastifyInstance } from "fastify";
import { ConversationController } from "../../controllers/ConversationController.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/", ConversationController.listConversations);
  app.get("/:id", ConversationController.getConversation);
  app.patch("/:id", ConversationController.updateStatus);
  app.get("/:id/messages", ConversationController.getMessages);
  app.post("/:id/messages", ConversationController.sendMessage);
}
