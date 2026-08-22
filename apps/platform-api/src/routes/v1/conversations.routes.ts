import type { FastifyInstance } from "fastify";
import { ConversationController } from "../../controllers/ConversationController.js";
import { MediaController } from "../../controllers/MediaController.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get("/", ConversationController.listConversations);
  app.get("/:id", ConversationController.getConversation);
  app.patch("/:id", ConversationController.updateStatus);
  app.post("/:id/suppress", ConversationController.suppress);
  app.post("/:id/messages/delete", ConversationController.suppressMessages);
  app.post("/:id/read", ConversationController.markRead);
  app.post("/:id/attachments", MediaController.uploadAttachment);
  app.get("/:id/messages", ConversationController.getMessages);
  app.post("/:id/messages", ConversationController.sendMessage);
}

export async function messageMediaRoutes(app: FastifyInstance) {
  app.get("/:messageId/media", MediaController.streamMessageMedia);
}
