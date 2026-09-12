import type { FastifyInstance } from "fastify";
import { HandoverController } from "../../controllers/HandoverController.js";
import { requireAuth } from "../../middleware/auth.js";

export default async function handoverRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { conversationId: string } }>(
    "/api/v1/conversations/:conversationId/notes",
    { preHandler: [requireAuth] },
    HandoverController.listNotes
  );

  fastify.post<{ Params: { conversationId: string }, Body: { note: string } }>(
    "/api/v1/conversations/:conversationId/notes",
    { preHandler: [requireAuth] },
    HandoverController.addNote
  );

  fastify.delete<{ Params: { conversationId: string, noteId: string } }>(
    "/api/v1/conversations/:conversationId/notes/:noteId",
    { preHandler: [requireAuth] },
    HandoverController.deleteNote
  );
}
