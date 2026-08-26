import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

/** Returns which roles the actor is allowed to create */
function allowedRolesToCreate(actorRole: Role): Role[] {
  switch (actorRole) {
    case "SUPER_ADMIN": return ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];
    case "ADMIN": return ["ADMIN", "MANAGER", "AGENT"];
    default: return [];
  }
}

/** Returns true if actor can manage (edit/deactivate) the target user */
function canManageUser(actorRole: Role, targetRole: Role, actorId: string, targetId: string): boolean {
  if (actorId === targetId) return false; // can't edit yourself here
  const hierarchy: Role[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];
  const actorIdx = hierarchy.indexOf(actorRole);
  const targetIdx = hierarchy.indexOf(targetRole);
  // Super Admin can manage anyone else
  if (actorRole === "SUPER_ADMIN") return targetId !== actorId;
  // Admin can manage other Admins (and below)
  if (actorRole === "ADMIN" && targetRole === "ADMIN") return true;
  return actorIdx < targetIdx;
}

export class UserController {
  static async listUsers(_request: FastifyRequest, reply: FastifyReply) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        teamId: true,
        team: { select: { name: true } },
        createdAt: true,
      },
    });
    return reply.send(users);
  }

  static async createUser(
    request: FastifyRequest<{ Body: { email: string; role: Role; teamId?: string } }>,
    reply: FastifyReply,
  ) {
    const actorRole = (request.user as any)?.role as Role;
    const actorId = (request.user as any)?.id as string;
    const { email, role, teamId } = request.body ?? {};

    if (!email || !role) return reply.code(400).send({ error: "email and role are required" });

    const allowed = allowedRolesToCreate(actorRole);
    if (!allowed.includes(role)) {
      return reply.code(403).send({
        error: `Your role (${actorRole}) cannot create users with role ${role}`,
      });
    }

    const existing = await prisma.user.findUnique({ where: { username: email.trim() } });
    if (existing) return reply.code(400).send({ error: "A user with this email already exists" });

    try {
      const user = await prisma.user.create({
        data: {
          id: ulid(),
          username: email.trim().toLowerCase(),
          role: role as any,
          teamId: teamId ?? null,
          createdById: actorId,
        },
        select: { id: true, username: true, role: true, teamId: true, createdAt: true },
      });
      return reply.code(201).send(user);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to create user", details: err.message });
    }
  }

  static async updateUser(
    request: FastifyRequest<{ Params: { id: string }; Body: { role?: Role; teamId?: string; isActive?: boolean } }>,
    reply: FastifyReply,
  ) {
    const actorRole = (request.user as any)?.role as Role;
    const actorId = (request.user as any)?.id as string;
    const { id } = request.params;
    const { role, teamId, isActive } = request.body ?? {};

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return reply.code(404).send({ error: "user not found" });

    if (!canManageUser(actorRole, target.role as Role, actorId, id)) {
      return reply.code(403).send({ error: "You do not have permission to manage this user" });
    }

    if (role) {
      const allowed = allowedRolesToCreate(actorRole);
      if (!allowed.includes(role)) {
        return reply.code(403).send({ error: `Cannot assign role ${role}` });
      }
    }

    try {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          role: (role as any) ?? undefined,
          teamId: teamId !== undefined ? (teamId ?? null) : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
        },
        select: { id: true, username: true, role: true, teamId: true, isActive: true },
      });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update user", details: err.message });
    }
  }
}
