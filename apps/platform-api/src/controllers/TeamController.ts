import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { ulid } from "ulid";

export class TeamController {
  static async createTeam(
    request: FastifyRequest<{ Body: { name: string; managerId?: string; parentTeamId?: string } }>,
    reply: FastifyReply,
  ) {
    const { name, managerId, parentTeamId } = request.body ?? {};
    if (!name) {
      return reply.code(400).send({ error: "name is required" });
    }

    const userRole = (request.user as any)?.role;
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can create teams" });
    }

    try {
      const team = await prisma.team.create({
        data: {
          id: ulid(),
          name,
          managerId,
          parentTeamId,
        },
      });
      return reply.code(201).send(team);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to create team", details: err.message });
    }
  }

  static async listTeams(_request: FastifyRequest, reply: FastifyReply) {
    const teams = await prisma.team.findMany({
      include: { manager: { select: { username: true } }, _count: { select: { members: true, tickets: true } } }
    });
    return reply.send(teams);
  }

  static async updateTeam(
    request: FastifyRequest<{ Params: { id: string }, Body: { name?: string; managerId?: string; parentTeamId?: string } }>,
    reply: FastifyReply,
  ) {
    const { id } = request.params;
    const { name, managerId, parentTeamId } = request.body ?? {};

    const userRole = (request.user as any)?.role;
    if (userRole !== "SUPER_ADMIN" && userRole !== "ADMIN") {
      return reply.code(403).send({ error: "Only admins can update teams" });
    }

    try {
      const team = await prisma.team.update({
        where: { id },
        data: { name, managerId, parentTeamId },
      });
      return reply.send(team);
    } catch (err: any) {
      return reply.code(400).send({ error: "failed to update team", details: err.message });
    }
  }
}
