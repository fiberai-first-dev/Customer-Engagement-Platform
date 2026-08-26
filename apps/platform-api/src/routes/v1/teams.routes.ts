import type { FastifyInstance } from "fastify";
import { TeamController } from "../../controllers/TeamController.js";
import { requireAdmin } from "../../middleware/auth.js";

export async function teamRoutes(app: FastifyInstance) {
  // Only admins can create and update teams
  app.post("/", { preHandler: [requireAdmin] }, TeamController.createTeam as any);
  app.patch("/:id", { preHandler: [requireAdmin] }, TeamController.updateTeam as any);
  
  // Everyone can list teams (e.g. for assignment dropdowns)
  app.get("/", TeamController.listTeams as any);
}
