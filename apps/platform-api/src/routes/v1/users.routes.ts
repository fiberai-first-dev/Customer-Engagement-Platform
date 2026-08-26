import type { FastifyInstance } from "fastify";
import { UserController } from "../../controllers/UserController.js";
import { requireAdmin } from "../../middleware/auth.js";

export async function userRoutes(app: FastifyInstance) {
  // Only Admin+ can list and manage users
  app.get("/", { preHandler: [requireAdmin] }, UserController.listUsers as any);
  app.post("/", { preHandler: [requireAdmin] }, UserController.createUser as any);
  app.patch("/:id", { preHandler: [requireAdmin] }, UserController.updateUser as any);
}
