import type { FastifyInstance } from "fastify";
import { ulid } from "ulid";
import type { ChannelType, Prisma } from "./generated/client/index.js";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";
import {
  ingestInboundMessages,
  mergeChannelConfig,
  redactConfig,
  sendConversationMessage,
} from "./services/messaging.js";
import { getChannelAdapter, type ChannelType as AdapterChannel } from "@cep/channels";
import { env } from "./env.js";

const channelTypes: ChannelType[] = ["whatsapp", "instagram", "email"];

function isChannelType(value: unknown): value is ChannelType {
  return typeof value === "string" && channelTypes.includes(value as ChannelType);
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, service: "platform-api" }));

  app.get("/", async () => ({
    service: "platform-api",
    message: "This is the CEP API. Open the agent UI at http://localhost:5173",
    health: "/health",
    docs: "See docs/PLATFORM.md",
  }));

  app.addHook("preHandler", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (path === "/" || path === "/health" || path.startsWith("/webhooks/")) {
      return;
    }
    await requireAdmin(request, reply);
    if (reply.sent) return;
  });

  app.post<{ Body: { name?: string } }>("/api/v1/accounts", async (request, reply) => {
    const name = request.body?.name?.trim() || "Default Account";
    const account = await prisma.account.create({
      data: { id: ulid(), name },
    });
    return reply.code(201).send(account);
  });

  app.get("/api/v1/accounts", async () => prisma.account.findMany({ orderBy: { createdAt: "asc" } }));

  app.get<{ Params: { accountId: string } }>(
    "/api/v1/accounts/:accountId/inboxes",
    async (request) => {
      const inboxes = await prisma.inbox.findMany({
        where: { accountId: request.params.accountId },
        orderBy: { createdAt: "asc" },
      });
      return inboxes.map((inbox) => ({
        ...inbox,
        channelConfig: redactConfig(inbox.channelConfig),
        webhookUrl: `${env.publicBaseUrl}/webhooks/${inbox.channelType}/${inbox.id}`,
      }));
    },
  );

  app.post<{
    Params: { accountId: string };
    Body: { name?: string; channelType?: string; channelConfig?: Record<string, unknown> };
  }>("/api/v1/accounts/:accountId/inboxes", async (request, reply) => {
    const { name, channelType, channelConfig } = request.body ?? {};
    if (!isChannelType(channelType)) {
      return reply.code(400).send({ error: "channelType must be whatsapp|instagram|email" });
    }
    const account = await prisma.account.findUnique({ where: { id: request.params.accountId } });
    if (!account) return reply.code(404).send({ error: "account not found" });

    const inbox = await prisma.inbox.create({
      data: {
        id: ulid(),
        accountId: account.id,
        name: name?.trim() || `${channelType} inbox`,
        channelType,
        channelConfig: (channelConfig ?? { mock: true }) as Prisma.InputJsonValue,
      },
    });

    return reply.code(201).send({
      ...inbox,
      channelConfig: redactConfig(inbox.channelConfig),
      webhookUrl: `${env.publicBaseUrl}/webhooks/${inbox.channelType}/${inbox.id}`,
    });
  });

  app.patch<{
    Params: { inboxId: string };
    Body: {
      name?: string;
      enabled?: boolean;
      channelConfig?: Record<string, unknown>;
    };
  }>("/api/v1/inboxes/:inboxId", async (request, reply) => {
    const existing = await prisma.inbox.findUnique({ where: { id: request.params.inboxId } });
    if (!existing) return reply.code(404).send({ error: "inbox not found" });

    const body = request.body ?? {};
    const nextConfig =
      body.channelConfig !== undefined
        ? mergeChannelConfig(existing.channelConfig, body.channelConfig)
        : undefined;

    const inbox = await prisma.inbox.update({
      where: { id: existing.id },
      data: {
        name: body.name?.trim() || undefined,
        enabled: body.enabled,
        channelConfig: nextConfig,
      },
    });

    return {
      ...inbox,
      channelConfig: redactConfig(inbox.channelConfig),
      webhookUrl: `${env.publicBaseUrl}/webhooks/${inbox.channelType}/${inbox.id}`,
    };
  });

  app.get<{
    Querystring: { accountId?: string; inboxId?: string; status?: string };
  }>("/api/v1/conversations", async (request) => {
    const { accountId, inboxId, status } = request.query;
    return prisma.conversation.findMany({
      where: {
        accountId: accountId || undefined,
        inboxId: inboxId || undefined,
        status: status === "open" || status === "pending" || status === "resolved" ? status : undefined,
      },
      include: {
        contact: true,
        inbox: { select: { id: true, name: true, channelType: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
  });

  app.get<{ Params: { id: string } }>("/api/v1/conversations/:id", async (request, reply) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
      include: {
        contact: true,
        inbox: { select: { id: true, name: true, channelType: true } },
      },
    });
    if (!conversation) return reply.code(404).send({ error: "not found" });
    return conversation;
  });

  app.get<{ Params: { id: string } }>(
    "/api/v1/conversations/:id/messages",
    async (request, reply) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: request.params.id },
      });
      if (!conversation) return reply.code(404).send({ error: "not found" });
      return prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 500,
      });
    },
  );

  app.post<{
    Params: { id: string };
    Body: { content?: string; subject?: string };
  }>("/api/v1/conversations/:id/messages", async (request, reply) => {
    const content = request.body?.content?.trim();
    if (!content) return reply.code(400).send({ error: "content is required" });
    try {
      const result = await sendConversationMessage({
        conversationId: request.params.id,
        content,
        subject: request.body?.subject,
      });
      return reply.code(result.result.ok ? 201 : 502).send(result);
    } catch (err) {
      return reply.code(400).send({
        error: err instanceof Error ? err.message : "send failed",
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { status?: "open" | "pending" | "resolved" };
  }>("/api/v1/conversations/:id", async (request, reply) => {
    const status = request.body?.status;
    if (status !== "open" && status !== "pending" && status !== "resolved") {
      return reply.code(400).send({ error: "invalid status" });
    }
    try {
      return await prisma.conversation.update({
        where: { id: request.params.id },
        data: { status },
      });
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
  });

  // Meta-style webhook verification + receive
  app.get<{
    Params: { channel: string; inboxId: string };
    Querystring: Record<string, string>;
  }>("/webhooks/:channel/:inboxId", async (request, reply) => {
    if (!isChannelType(request.params.channel)) {
      return reply.code(404).send("not found");
    }
    const inbox = await prisma.inbox.findUnique({ where: { id: request.params.inboxId } });
    if (!inbox || inbox.channelType !== request.params.channel) {
      return reply.code(404).send("not found");
    }
    const adapter = getChannelAdapter(inbox.channelType as AdapterChannel);
    if (!adapter.verifyWebhook) {
      return reply.code(400).send("verification not supported");
    }
    const challenge = adapter.verifyWebhook(
      inbox.channelConfig as never,
      request.query,
    );
    if (challenge == null) return reply.code(403).send("forbidden");
    return reply.type("text/plain").send(challenge);
  });

  app.post<{
    Params: { channel: string; inboxId: string };
  }>("/webhooks/:channel/:inboxId", async (request, reply) => {
    if (!isChannelType(request.params.channel)) {
      return reply.code(404).send({ error: "not found" });
    }
    try {
      const result = await ingestInboundMessages({
        inboxId: request.params.inboxId,
        payload: request.body,
      });
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      return reply.code(400).send({
        ok: false,
        error: err instanceof Error ? err.message : "ingest failed",
      });
    }
  });

  // Local / staging helper — no Meta needed
  app.post<{
    Body: {
      inboxId?: string;
      from?: string;
      name?: string;
      content?: string;
      subject?: string;
    };
  }>("/api/v1/dev/simulate-inbound", async (request, reply) => {
    const { inboxId, from, name, content, subject } = request.body ?? {};
    if (!inboxId || !from || !content) {
      return reply.code(400).send({ error: "inboxId, from, content required" });
    }
    const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
    if (!inbox) return reply.code(404).send({ error: "inbox not found" });

    let payload: unknown;
    if (inbox.channelType === "whatsapp") {
      const waFrom = from.replace(/^\+/, "");
      payload = {
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [{ wa_id: waFrom, profile: { name: name ?? "Simulated" } }],
                  messages: [
                    {
                      id: `wamid.sim.${ulid()}`,
                      from: waFrom,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: content },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
    } else if (inbox.channelType === "instagram") {
      payload = {
        entry: [
          {
            messaging: [
              {
                sender: { id: from },
                timestamp: Date.now(),
                message: { mid: `mid.sim.${ulid()}`, text: content },
              },
            ],
          },
        ],
      };
    } else {
      payload = {
        id: `email.sim.${ulid()}`,
        from,
        fromName: name,
        subject: subject ?? "Simulated email",
        text: content,
      };
    }

    const result = await ingestInboundMessages({ inboxId, payload });
    return reply.code(201).send(result);
  });
}
