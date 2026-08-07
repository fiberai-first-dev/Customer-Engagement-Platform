import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { createUser, listUsers, verifyUser } from "../services/UserService.js";

export class AuthController {
  static async login(
    request: FastifyRequest<{ Body: { username?: string; password?: string } }>,
    reply: FastifyReply,
  ) {
    const { username, password } = request.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: "Username and password required" });
    }

    const user = await verifyUser(username, password);
    if (!user) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: "ADMIN" },
      env.jwtSecret,
      { expiresIn: "14d" },
    );
    return reply.code(200).send({
      ok: true,
      token,
      role: "ADMIN",
      username: user.username,
    });
  }

  /** Authenticated: create additional users (Settings → Users). */
  static async createUser(
    request: FastifyRequest<{ Body: { username?: string; password?: string } }>,
    reply: FastifyReply,
  ) {
    const { username, password } = request.body ?? {};
    if (!username || !password) {
      return reply.code(400).send({ error: "username and password required" });
    }
    try {
      const user = await createUser(username, password);
      return reply.code(201).send({ ok: true, id: user.id, username: user.username });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async listUsers(_request: FastifyRequest, reply: FastifyReply) {
    const users = await listUsers();
    return reply.send(users);
  }
}
