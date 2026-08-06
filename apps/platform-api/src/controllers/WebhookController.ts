import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import { getChannelAdapter, resolveChannelConfig } from "../adapters/shared/index.js";
import { ingestInboundMessages } from "../services/MessagingService.js";
import { handlePubSubNotification } from "../services/EmailService.js";
import type { ChannelType, Inbox } from "../generated/client/index.js";

const channelTypes = ["whatsapp", "instagram", "email"] as const;

/** Prefer enabled inbox; fall back to any inbox for the channel. */
async function resolveChannelInbox(channelType: ChannelType): Promise<Inbox | null> {
  const enabled = await prisma.inbox.findFirst({
    where: { channelType, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  if (enabled) return enabled;
  return prisma.inbox.findFirst({
    where: { channelType },
    orderBy: { createdAt: "asc" },
  });
}

export class WebhookController {
  /** GET /webhooks/:channel — Meta verify */
  static async unifiedVerifyWebhook(
    request: FastifyRequest<{ Params: { channel: string }; Querystring: Record<string, string> }>,
    reply: FastifyReply,
  ) {
    if (!channelTypes.includes(request.params.channel as ChannelType)) {
      return reply.code(404).send("not found");
    }
    const adapter = getChannelAdapter(request.params.channel as ChannelType);
    if (!adapter.verifyWebhook) return reply.code(400).send("verification not supported");

    const channelType = request.params.channel as ChannelType;
    const inboxes = await prisma.inbox.findMany({
      where: { channelType },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    for (const inbox of inboxes) {
      const config = resolveChannelConfig(inbox.channelType, inbox.channelConfig);
      const challenge = adapter.verifyWebhook(config as never, request.query);
      if (challenge != null) {
        if (!inbox.enabled) {
          await prisma.inbox.update({ where: { id: inbox.id }, data: { enabled: true } });
        }
        return reply.type("text/plain").send(challenge);
      }
    }
    return reply.code(403).send("forbidden");
  }

  /** POST /webhooks/:channel — ingest into the channel inbox */
  static async unifiedReceiveWebhook(
    request: FastifyRequest<{ Params: { channel: string } }>,
    reply: FastifyReply,
  ) {
    const channel = request.params.channel;
    request.log.info(
      { channel, path: `/webhooks/${channel}` },
      `webhook POST /webhooks/${channel}`,
    );
    if (!channelTypes.includes(channel as ChannelType)) {
      return reply.code(404).send({ error: "not found" });
    }
    const resolved = await resolveChannelInbox(channel as ChannelType);
    if (!resolved) {
      return reply.code(404).send({ error: "no inbox found for this channel — run seed / restart API" });
    }
    if (!resolved.enabled) {
      await prisma.inbox.update({ where: { id: resolved.id }, data: { enabled: true } });
    }
    try {
      const result = await ingestInboundMessages({
        inboxId: resolved.id,
        payload: request.body,
      });
      const body = request.body as Record<string, unknown> | null;
      const kind = classifyInstagramWebhook(body);
      if (!result.created && !result.duplicates) {
        request.log.warn(
          {
            channel,
            path: `/webhooks/${channel}`,
            inboxId: resolved.id,
            kind,
            bodyKeys: body && typeof body === "object" ? Object.keys(body) : [],
          },
          "webhook parsed 0 messages",
        );
      } else {
        request.log.info(
          {
            channel,
            path: `/webhooks/${channel}`,
            inboxId: resolved.id,
            created: result.created,
            duplicates: result.duplicates,
          },
          "webhook ingested",
        );
      }
      return reply.code(200).send({ ok: true, ...result });
    } catch (err: any) {
      request.log.error({ err, channel, path: `/webhooks/${channel}` }, "webhook ingest failed");
      return reply.code(400).send({ ok: false, error: err.message });
    }
  }

  static async handlePubSub(request: FastifyRequest, reply: FastifyReply) {
    try {
      const result = await handlePubSubNotification(request.body as any);
      return reply.code(200).send({ ok: true, ...result });
    } catch (err: any) {
      request.log.error(err, "Email Pub/Sub notification failed");
      return reply.code(200).send({ ok: false, error: err.message });
    }
  }
}

function classifyInstagramWebhook(body: unknown): string {
  if (!body || typeof body !== "object") return "unknown";
  const root = body as Record<string, unknown>;
  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const messaging = Array.isArray(e.messaging) ? e.messaging : [];
    for (const ev of messaging) {
      if (!ev || typeof ev !== "object") continue;
      const m = ev as Record<string, unknown>;
      if (m.read) return "read_receipt";
      if (m.delivery) return "delivery";
      if (m.reaction) return "reaction";
      if (m.message) return "message";
    }
    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const c = change as Record<string, unknown>;
      const value = c.value && typeof c.value === "object" ? (c.value as Record<string, unknown>) : null;
      if (value?.message) return "message";
      if (value?.read) return "read_receipt";
    }
  }
  if (root.field === "messages") return "dashboard_sample";
  return "unknown";
}
