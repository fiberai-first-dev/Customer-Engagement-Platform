import type { FastifyInstance } from "fastify";
import { ConversationController } from "../../controllers/ConversationController.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/", ConversationController.listConversations);
  app.get("/:id", ConversationController.getConversation);
  app.patch("/:id", ConversationController.updateStatus);
  app.post("/:id/suppress", ConversationController.suppress);
  app.post("/:id/messages/delete", ConversationController.suppressMessages);
  app.get("/:id/messages", ConversationController.getMessages);
  app.post("/:id/messages", ConversationController.sendMessage);
}
