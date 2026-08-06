import type { FastifyInstance } from "fastify";
import { ContactController } from "../../controllers/ContactController.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/", ContactController.listContacts);
}
