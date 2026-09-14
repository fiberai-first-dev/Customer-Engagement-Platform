import { randomBytes } from "crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { ulid } from "ulid";

export type WebChatChannelConfigJson = {
  widgetKey?: string;
  allowedOrigins?: string[];
};

export function generateWidgetKey(): string {
  return `pk_${randomBytes(24).toString("base64url")}`;
}

export function parseWebChatConfig(raw: unknown): WebChatChannelConfigJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const widgetKey = typeof obj.widgetKey === "string" ? obj.widgetKey.trim() : undefined;
  const allowedOrigins = Array.isArray(obj.allowedOrigins)
    ? obj.allowedOrigins
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  return { widgetKey, allowedOrigins };
}

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function extractRequestOrigin(request: FastifyRequest): string | null {
  const originHeader = request.headers.origin;
  if (typeof originHeader === "string" && originHeader.trim()) {
    return normalizeOrigin(originHeader);
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.trim()) {
    return normalizeOrigin(referer);
  }
  return null;
}

function isOriginAllowed(requestOrigin: string | null, allowedOrigins: string[]): boolean {
  const normalizedAllowed = allowedOrigins
    .map((o) => normalizeOrigin(o))
    .filter((o): o is string => Boolean(o));

  // Always allow the CEP agent UI (widget preview at /chat).
  const webBase = normalizeOrigin(env.webBaseUrl);
  if (webBase && !normalizedAllowed.includes(webBase)) {
    normalizedAllowed.push(webBase);
  }

  // Empty allowlist (aside from auto-added CEP web) → no domain restriction.
  // If the only entry is CEP webBase and user set nothing, treat as unrestricted.
  const userProvided = allowedOrigins
    .map((o) => normalizeOrigin(o))
    .filter((o): o is string => Boolean(o));
  if (userProvided.length === 0) return true;

  if (!requestOrigin) return false;
  return normalizedAllowed.includes(requestOrigin);
}

/**
 * Ensure web_chat ChannelConfig exists and has a widgetKey.
 */
export async function ensureWebChatChannelConfig() {
  const existing = await prisma.channelConfig.findFirst({
    where: { channelType: "web_chat" },
  });

  if (!existing) {
    return prisma.channelConfig.create({
      data: {
        id: ulid(),
        name: "Web Chat",
        channelType: "web_chat",
        channelConfig: {
          widgetKey: generateWidgetKey(),
          allowedOrigins: [],
        },
        enabled: true,
      },
    });
  }

  const parsed = parseWebChatConfig(existing.channelConfig);
  const needsEnable = !existing.enabled;
  const needsKey = !parsed.widgetKey;

  if (!needsEnable && !needsKey) return existing;

  const nextConfig: WebChatChannelConfigJson = {
    widgetKey: parsed.widgetKey || generateWidgetKey(),
    allowedOrigins: parsed.allowedOrigins ?? [],
  };

  return prisma.channelConfig.update({
    where: { id: existing.id },
    data: {
      ...(needsEnable ? { enabled: true } : {}),
      channelConfig: nextConfig as object,
    },
  });
}

export async function getWebChatSettings() {
  const cfg = await ensureWebChatChannelConfig();
  const parsed = parseWebChatConfig(cfg.channelConfig);
  return {
    enabled: cfg.enabled,
    widgetKey: parsed.widgetKey ?? "",
    allowedOrigins: parsed.allowedOrigins ?? [],
  };
}

export async function updateWebChatSettings(input: {
  allowedOrigins?: string[];
  rotateKey?: boolean;
}) {
  const cfg = await ensureWebChatChannelConfig();
  const parsed = parseWebChatConfig(cfg.channelConfig);
  const next: WebChatChannelConfigJson = {
    widgetKey:
      input.rotateKey || !parsed.widgetKey ? generateWidgetKey() : parsed.widgetKey,
    allowedOrigins:
      input.allowedOrigins !== undefined
        ? input.allowedOrigins
            .map((o) => o.trim())
            .filter(Boolean)
        : parsed.allowedOrigins ?? [],
  };

  const updated = await prisma.channelConfig.update({
    where: { id: cfg.id },
    data: { channelConfig: next as object },
  });

  const out = parseWebChatConfig(updated.channelConfig);
  return {
    enabled: updated.enabled,
    widgetKey: out.widgetKey ?? "",
    allowedOrigins: out.allowedOrigins ?? [],
  };
}

/** Validate widget key + optional Origin/Referer allowlist on public embed APIs. */
export async function assertWebChatWidgetAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const cfg = await ensureWebChatChannelConfig();
  if (!cfg.enabled) {
    void reply.code(403).send({ error: "Web chat is disabled" });
    return false;
  }

  const parsed = parseWebChatConfig(cfg.channelConfig);
  const headerKey = request.headers["x-cep-widget-key"];
  const key = typeof headerKey === "string" ? headerKey.trim() : "";

  if (!parsed.widgetKey || key !== parsed.widgetKey) {
    void reply.code(401).send({ error: "Invalid or missing widget key" });
    return false;
  }

  const requestOrigin = extractRequestOrigin(request);
  if (!isOriginAllowed(requestOrigin, parsed.allowedOrigins ?? [])) {
    void reply.code(403).send({ error: "Origin not allowed for this widget" });
    return false;
  }

  return true;
}
