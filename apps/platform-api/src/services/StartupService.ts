import { prisma } from "../config/db.js";
import {
  resolveChannelConfig,
  type EmailChannelConfig,
  type InstagramChannelConfig,
  type WhatsAppChannelConfig,
} from "../adapters/shared/index.js";
import { ensureWorkspace } from "./WorkspaceService.js";
import { catchUpRecentEmailMessages, renewEmailWatch } from "./EmailService.js";
import { subscribeInstagramMessaging } from "./OAuthService.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasString(config: Record<string, unknown>, key: string): boolean {
  const v = config[key];
  return typeof v === "string" && v.trim().length > 0 && v !== "***";
}

/**
 * Full auto-start after migrate: workspace + channel readiness.
 * Never throws — logs warnings so the API still comes up.
 */
export async function bootstrapRuntime(): Promise<void> {
  try {
    await ensureWorkspace();
  } catch (err) {
    console.error(
      "[boot] ensureWorkspace failed:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  await Promise.all([
    prepareWhatsApp(),
    prepareInstagram(),
    prepareEmail(),
  ]);
}

async function prepareWhatsApp() {
  try {
    const inbox = await prisma.inbox.findFirst({
      where: { channelType: "whatsapp" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:whatsapp] no inbox");
      return;
    }
    const cfg = resolveChannelConfig("whatsapp", inbox.channelConfig) as WhatsAppChannelConfig;
    const ready = Boolean(cfg.phoneNumberId && cfg.accessToken);
    if (ready && !inbox.enabled) {
      await prisma.inbox.update({ where: { id: inbox.id }, data: { enabled: true } });
    }
    console.log(
      ready
        ? `[boot:whatsapp] ready inbox=${inbox.id} phoneNumberId=set verifyToken=${cfg.verifyToken ? "set" : "missing"}`
        : `[boot:whatsapp] incomplete inbox=${inbox.id} — set WHATSAPP_* in .env or Settings`,
    );
  } catch (err) {
    console.warn("[boot:whatsapp]", err instanceof Error ? err.message : err);
  }
}

async function prepareInstagram() {
  try {
    const inbox = await prisma.inbox.findFirst({
      where: { channelType: "instagram" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:instagram] no inbox");
      return;
    }
    const cfg = resolveChannelConfig("instagram", inbox.channelConfig) as InstagramChannelConfig;
    const ready = Boolean(cfg.accessToken && cfg.verifyToken);
    if (ready && !inbox.enabled) {
      await prisma.inbox.update({ where: { id: inbox.id }, data: { enabled: true } });
    }
    if (!cfg.accessToken) {
      console.warn(
        `[boot:instagram] incomplete inbox=${inbox.id} — set INSTAGRAM_ACCESS_TOKEN or Connect in Settings`,
      );
      return;
    }

    const sub = await subscribeInstagramMessaging(cfg.accessToken);
    console.log(
      sub.ok
        ? `[boot:instagram] subscribed messaging inbox=${inbox.id}`
        : `[boot:instagram] subscribe soft-failed inbox=${inbox.id}: ${sub.error ?? "unknown"} (API still up; check Meta webhook URL + Dev mode)`,
    );
  } catch (err) {
    console.warn("[boot:instagram]", err instanceof Error ? err.message : err);
  }
}

async function prepareEmail() {
  try {
    const inbox = await prisma.inbox.findFirst({
      where: { channelType: "email" },
      orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
    });
    if (!inbox) {
      console.warn("[boot:email] no inbox");
      return;
    }

    const cfg = resolveChannelConfig("email", inbox.channelConfig) as EmailChannelConfig;
    const raw = asRecord(inbox.channelConfig);
    const hasOAuth =
      hasString(raw, "refreshToken") ||
      hasString(raw, "accessToken") ||
      Boolean(cfg.refreshToken || cfg.accessToken);
    const hasTopic = Boolean(cfg.pubsubTopic?.trim());

    if (!hasOAuth || !hasTopic) {
      console.warn(
        `[boot:email] incomplete inbox=${inbox.id} oauth=${hasOAuth} pubsubTopic=${hasTopic} — set GMAIL_* in .env or Connect Gmail`,
      );
      return;
    }

    if (!inbox.enabled) {
      await prisma.inbox.update({ where: { id: inbox.id }, data: { enabled: true } });
    }

    const results = await renewEmailWatch(inbox.id);
    for (const r of results) {
      if (r.ok) {
        console.log(`[boot:email] watch ready inbox=${r.inboxId} expires=${r.expiresAt ?? "?"}`);
      } else {
        console.warn(`[boot:email] watch failed inbox=${r.inboxId}: ${r.error}`);
      }
    }

    // Pull recent INBOX so redeploy doesn't wait for the next inbound Pub/Sub ping
    const catchUp = await catchUpRecentEmailMessages(inbox.id);
    console.log(
      `[boot:email] catch-up inbox=${inbox.id} processed=${catchUp.processed} skipped=${catchUp.skipped}`,
    );
  } catch (err) {
    console.warn("[boot:email]", err instanceof Error ? err.message : err);
  }
}
