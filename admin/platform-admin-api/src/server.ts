import Fastify from "fastify";
import cors from "@fastify/cors";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

// Import the ADMIN's SQLite Prisma client
import { PrismaClient as AdminPrismaClient } from "@prisma/client";

// Import the TENANT's shared Prisma client (from platform-api generated client)
import { PrismaClient as TenantPrismaClient } from "../../../client/platform-api/src/generated/client/index.js";

const adminPrisma = new AdminPrismaClient();
const app = Fastify({ logger: true });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const JWT_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-do-not-use-in-prod-v2";
const PORT = 4200;

app.register(cors, { origin: true });

app.post<{ Body: { credential?: string } }>("/api/v1/auth/admin-login", async (request, reply) => {
  const { credential } = request.body ?? {};
  if (!credential) {
    return reply.code(400).send({ error: "Google credential required" });
  }

  try {
    let email: string | undefined;

    try {
      const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (userInfoRes.ok) {
        const info = (await userInfoRes.json()) as { email?: string };
        email = info.email;
      }
    } catch {
      // ignore
    }

    if (!email) {
      const client = new OAuth2Client(GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID,
      });
      email = ticket.getPayload()?.email;
    }

    if (!email) {
      return reply.code(401).send({ error: "Could not verify Google identity" });
    }

    if (!SUPER_ADMIN_EMAIL || email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      return reply.code(403).send({ error: "Access denied: Email does not match SUPER_ADMIN_EMAIL" });
    }

    const token = jwt.sign({ email, role: "SUPER_ADMIN" }, JWT_SECRET, { expiresIn: "14d" });
    return reply.send({ ok: true, token, role: "SUPER_ADMIN", username: email });
  } catch (err: any) {
    return reply.code(401).send({ error: "Google authentication failed", details: err.message });
  }
});

// Middleware for admin routes
app.addHook("preHandler", async (request, reply) => {
  if (request.url.includes("/api/v1/auth/admin-login")) return;

  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return reply.code(401).send({ error: "Unauthorized" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== "SUPER_ADMIN") throw new Error("Super admin only");
  } catch {
    return reply.code(403).send({ error: "Forbidden" });
  }
});

// --- Organizations Management ---

app.get("/api/v1/admin/organizations", async (_request, reply) => {
  const orgs = await adminPrisma.organization.findMany({ orderBy: { createdAt: "desc" } });
  return reply.send(orgs);
});

app.post<{ Body: { name: string; websiteUrl: string; dbName: string; openreplayProjectKey?: string } }>("/api/v1/admin/organizations", async (request, reply) => {
  const { name, websiteUrl, dbName, openreplayProjectKey } = request.body;
  if (!name || !dbName) {
    return reply.code(400).send({ error: "Name and dbName are required" });
  }
  try {
    const org = await adminPrisma.organization.create({
      data: { name, websiteUrl, dbName, openreplayProjectKey },
    });
    return reply.send(org);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Helper to connect to a specific tenant DB
function getTenantClient(dbName: string) {
  return new TenantPrismaClient({
    datasourceUrl: `postgresql://cep:cep@localhost:5434/${dbName}`,
  });
}

app.get<{ Params: { id: string } }>("/api/v1/admin/organizations/:id/sessions", async (request, reply) => {
  const org = await adminPrisma.organization.findUnique({ where: { id: request.params.id } });
  if (!org) return reply.code(404).send({ error: "Organization not found" });

  const tenantPrisma = getTenantClient(org.dbName);
  try {
    const sessions = await tenantPrisma.userSession.findMany({ 
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        _count: {
          select: { events: true }
        }
      }
    });
    return reply.send(sessions);
  } catch (err: any) {
    return reply.code(500).send({ error: `Could not fetch sessions: ${err.message}` });
  } finally {
    await tenantPrisma.$disconnect();
  }
});

app.get<{ Params: { id: string; sessionId: string } }>("/api/v1/admin/organizations/:id/sessions/:sessionId/events", async (request, reply) => {
  const org = await adminPrisma.organization.findUnique({ where: { id: request.params.id } });
  if (!org) return reply.code(404).send({ error: "Organization not found" });

  const tenantPrisma = getTenantClient(org.dbName);
  try {
    const events = await tenantPrisma.sessionEvent.findMany({ 
      where: { sessionId: request.params.sessionId },
      orderBy: { createdAt: "asc" }
    });
    return reply.send(events.map(e => e.data));
  } catch (err: any) {
    return reply.code(500).send({ error: `Could not fetch events: ${err.message}` });
  } finally {
    await tenantPrisma.$disconnect();
  }
});

// --- Tenant Feature Flags Management ---

app.get<{ Params: { id: string } }>("/api/v1/admin/organizations/:id/features", async (request, reply) => {
  const org = await adminPrisma.organization.findUnique({ where: { id: request.params.id } });
  if (!org) return reply.code(404).send({ error: "Organization not found" });

  const tenantPrisma = getTenantClient(org.dbName);
  try {
    const features = await tenantPrisma.featureFlag.findMany({ orderBy: { key: "asc" } });
    return reply.send(features);
  } catch (err: any) {
    return reply.code(500).send({ error: `Could not connect to organization DB: ${err.message}` });
  } finally {
    await tenantPrisma.$disconnect();
  }
});

app.patch<{ Params: { id: string; key: string }; Body: { enabled: boolean } }>("/api/v1/admin/organizations/:id/features/:key", async (request, reply) => {
  const org = await adminPrisma.organization.findUnique({ where: { id: request.params.id } });
  if (!org) return reply.code(404).send({ error: "Organization not found" });

  const { key } = request.params;
  const { enabled } = request.body;
  const tenantPrisma = getTenantClient(org.dbName);
  try {
    const feature = await tenantPrisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled },
    });
    return reply.send(feature);
  } catch (err: any) {
    return reply.code(500).send({ error: `Could not update organization DB: ${err.message}` });
  } finally {
    await tenantPrisma.$disconnect();
  }
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Admin API running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
start();



