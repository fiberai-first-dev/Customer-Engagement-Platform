import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

import { prisma } from "../config/db.js";

export interface JwtPayload {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";
  teamId?: string | null;
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
    
    // Check if user is active and get their teamId from the DB
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { isActive: true, teamId: true }
    });

    if (!dbUser || !dbUser.isActive) {
      return reply.code(403).send({ error: "account deactivated or not found" });
    }

    payload.teamId = dbUser.teamId;
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

  if (request.user?.role !== "ADMIN" && request.user?.role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, admin+ only" });
  }
}

export async function requireManager(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const role = request.user?.role;
  if (role !== "MANAGER" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, manager+ only" });
  }
}

export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== "SUPER_ADMIN") {
    return reply.code(403).send({ error: "forbidden, super admin only" });
  }
}
