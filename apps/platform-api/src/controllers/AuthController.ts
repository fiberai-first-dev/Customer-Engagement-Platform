import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export class AuthController {
  static async login(
    request: FastifyRequest<{ Body: { username?: string; password?: string } }>,
    reply: FastifyReply,
  ) {
    const { username, password } = request.body ?? {};

    if (!username || !password) {
      return reply.code(400).send({ error: "Username and password required" });
    }

    // Admin is validated from .env only (never the database)
    if (username === env.adminUsername) {
      if (password !== env.adminPassword) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }
      const token = jwt.sign({ id: "admin", role: "ADMIN" }, env.jwtSecret, { expiresIn: "14d" });
      return reply.code(200).send({ ok: true, token, role: "ADMIN" });
    }

    return reply.code(401).send({ error: "Invalid credentials" });
  }
}
