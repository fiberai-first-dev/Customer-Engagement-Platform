import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token || token !== env.adminToken) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}
