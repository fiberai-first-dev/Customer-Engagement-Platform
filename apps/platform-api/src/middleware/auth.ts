import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtPayload {
  id: string;
  role: "ADMIN" | "USER";
}

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  
  if (!token) {
    return reply.code(401).send({ error: "unauthorized" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    request.user = payload;
  } catch (err) {
    return reply.code(401).send({ error: "invalid token" });
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== "ADMIN") {
    return reply.code(403).send({ error: "forbidden, admin only" });
  }
}
