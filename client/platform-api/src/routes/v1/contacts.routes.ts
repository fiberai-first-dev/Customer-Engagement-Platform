import type { FastifyInstance } from "fastify";
import { ContactController } from "../../controllers/ContactController.js";

export async function contactsRoutes(app: FastifyInstance) {
  app.get("/", ContactController.listContacts);
  app.post("/", ContactController.createContact);
  app.post("/merge", ContactController.merge);
  app.get("/:id", ContactController.getOne);
  app.patch("/:id", ContactController.updateContact);
  app.delete("/:id", ContactController.deleteContact);
}
