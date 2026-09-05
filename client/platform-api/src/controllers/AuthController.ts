import type { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { findOrCreateGoogleUser, listUsers } from "../services/UserService.js";

export class AuthController {
  static async login(
    request: FastifyRequest<{ Body: { credential?: string } }>,
    reply: FastifyReply,
  ) {
    const { credential } = request.body ?? {};
    if (!credential) {
      if (env.MOCK) {
        // Allow empty credential in mock mode to fall through to bypass logic below
      } else {
        return reply.code(400).send({ error: "Google credential required" });
      }
    }

    try {
      let email: string | undefined;
      let googleId: string | undefined;

      if (env.MOCK && (!credential || credential === "mock_credential")) {
        email = "mock@fybud.com";
        googleId = "mock123";
      } else {
        // Try as an access_token via Google's userinfo endpoint
        try {
          const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${credential}` },
          });
          if (userInfoRes.ok) {
            const info = (await userInfoRes.json()) as { email?: string; sub?: string };
            email = info.email;
            googleId = info.sub;
          }
        } catch {
          /* not an access_token, try as id_token below */
        }

        // Try as an id_token (Google One Tap / auth-code flows)
        if (!email || !googleId) {
          const { OAuth2Client } = await import("google-auth-library");
          const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
          const ticket = await client.verifyIdToken({
            idToken: credential!,
            audience: process.env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (!payload?.email || !payload?.sub) {
            return reply.code(400).send({ error: "Invalid Google token payload" });
          }
          email = payload.email;
          googleId = payload.sub;
        }
      }

      if (!email || !googleId) {
        return reply.code(401).send({ error: "Could not verify Google identity" });
      }

      const user = await findOrCreateGoogleUser(email, googleId);

      // Force superadmin role in mock mode for review for ANY user
      if (env.MOCK) {
        if (user.role !== "SUPER_ADMIN" || !user.isActive) {
          const { prisma } = await import("../config/db.js");
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "SUPER_ADMIN", isActive: true },
          });
          user.role = "SUPER_ADMIN";
          user.isActive = true;
        }
      }

      if (!user.isActive) {
        return reply.code(403).send({ error: "Account is deactivated" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        env.jwtSecret,
        { expiresIn: "14d" },
      );

      return reply.code(200).send({
        ok: true,
        token,
        id: user.id,
        role: user.role,
        username: user.username,
      });
    } catch (err: any) {
      return reply.code(401).send({ error: err.message || "Google authentication failed" });
    }
  }

  static async listUsers(_request: FastifyRequest, reply: FastifyReply) {
    const users = await listUsers();
    return reply.send(users);
  }
}


