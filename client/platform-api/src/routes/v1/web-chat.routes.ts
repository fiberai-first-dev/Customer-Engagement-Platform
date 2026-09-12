import type { FastifyPluginAsync } from "fastify";
import { WebChatController } from "../../controllers/WebChatController.js";

export const webChatRoutes: FastifyPluginAsync = async (app) => {
  app.post("/session", WebChatController.createSession);
  app.post("/messages", WebChatController.sendMessage);
  app.get("/messages", WebChatController.getMessages);
};
