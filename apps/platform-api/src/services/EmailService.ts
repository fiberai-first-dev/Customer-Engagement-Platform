import type { Prisma } from "../generated/client/index.js";
import { prisma } from "../config/db.js";
import {
  emailAdapter,
  getEmailClient,
  resolveChannelConfig,
  type EmailChannelConfig,
} from "../adapters/shared/index.js";
import { ingestInboundMessages } from "./MessagingService.js";

interface PubSubPushBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface EmailPubSubData {
  emailAddress?: string;
  historyId?: string;
}

function asEmailConfig(raw: Prisma.JsonValue): EmailChannelConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  // Accept legacy provider:gmail rows and new email-only configs
  if (obj.provider === "gmail" || obj.refreshToken || obj.clientId) {
    return resolveChannelConfig("email", obj) as EmailChannelConfig;
  }
  return null;
}

/** Pick the enabled Email inbox (optional match on notification emailAddress). */
async function resolveEmailInbox(emailAddress?: string) {
  const candidates = await prisma.inbox.findMany({
    where: { channelType: "email", enabled: true },
  });
  const emailInboxes = candidates.filter((inbox) => asEmailConfig(inbox.channelConfig));

  if (emailAddress) {
    const matched = emailInboxes.find((inbox) => {
      const cfg = inbox.channelConfig as Record<string, unknown>;
      const email = typeof cfg.email === "string" ? cfg.email : null;
      return email === emailAddress;
    });
    if (matched) return matched;
  }

  if (emailInboxes.length === 1) return emailInboxes[0]!;
  if (emailInboxes.length === 0) {
    throw new Error("No enabled Email inbox found — run seed with Gmail tokens");
  }
  throw new Error("Multiple Email inboxes enabled — keep a single email inbox");
}

export async function handlePubSubNotification(
  body: PubSubPushBody,
): Promise<{ processed: number; skipped: number; inboxId: string; primed?: boolean }> {
  const rawData = body.message?.data;
  if (!rawData) throw new Error("Missing Pub/Sub message data");

  let pubsubData: EmailPubSubData;
  try {
    pubsubData = JSON.parse(Buffer.from(rawData, "base64").toString("utf-8"));
  } catch {
    throw new Error("Invalid Pub/Sub message data (not valid base64 JSON)");
  }

  const notificationHistoryId = String(pubsubData.historyId ?? "");
  if (!notificationHistoryId) throw new Error("Missing historyId in Pub/Sub data");

  const inbox = await resolveEmailInbox(pubsubData.emailAddress);
  const inboxId = inbox.id;

  const config = asEmailConfig(inbox.channelConfig);
  if (!config) throw new Error("Inbox is not configured for email");

  const startHistoryId = config.historyId ? String(config.historyId) : "";
  if (!startHistoryId) {
    console.warn(
      `[email] No historyId on inbox ${inboxId}; running users.watch now. ` +
        `This notification is baseline-only (0 messages). Send another email after watch succeeds.`,
    );
    try {
      await setupEmailWatch(inboxId);
    } catch (err) {
      console.error("[email] Auto watch setup failed:", err);
      await updateInboxConfig(inboxId, inbox.channelConfig, {
        historyId: notificationHistoryId,
      });
    }
    return { processed: 0, skipped: 0, inboxId, primed: true };
  }

  const gmail = getEmailClient(config);
  let messageIds: string[] = [];

  try {
    let pageToken: string | undefined;
    do {
      const historyRes = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        labelId: "INBOX",
        pageToken,
      });
      for (const h of historyRes.data.history ?? []) {
        for (const a of h.messagesAdded ?? []) {
          if (a.message?.id) messageIds.push(a.message.id);
        }
      }
      pageToken = historyRes.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (err: unknown) {
    const status = (err as { code?: number })?.code;
    console.warn("[email] history.list failed:", status ?? err);
    // Fall through to recent-inbox catch-up
  }

  // Catch-up: history cursor often skips the mail that primed historyId.
  if (messageIds.length === 0) {
    console.warn(
      `[email] history.list empty from ${startHistoryId}; fetching recent INBOX messages`,
    );
    const listRes = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 15,
    });
    messageIds = (listRes.data.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id);
  }

  messageIds = [...new Set(messageIds)];

  if (messageIds.length === 0) {
    await updateInboxConfig(inboxId, inbox.channelConfig, {
      historyId: notificationHistoryId,
    });
    return { processed: 0, skipped: 0, inboxId };
  }

  let processed = 0;
  let skipped = 0;

  for (const msgId of messageIds) {
    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });
      const msgData = msgRes.data;
      const labels = msgData.labelIds ?? [];
      if (labels.includes("SENT") && !labels.includes("INBOX")) {
        skipped++;
        continue;
      }

      const normalized = emailAdapter.parseInbound(config, msgData);
      if (normalized.length === 0) {
        skipped++;
        continue;
      }

      const result = await ingestInboundMessages({
        inboxId: inbox.id,
        payload: msgData,
        eventKey: `email:${normalized.map((m) => m.externalId).join(",")}`,
      });
      if (result.created > 0) processed += result.created;
      else skipped++;
    } catch (err) {
      console.error(`[email] Failed to process message ${msgId}:`, err);
      skipped++;
    }
  }

  await updateInboxConfig(inboxId, inbox.channelConfig, {
    historyId: notificationHistoryId,
  });

  console.info(`[email] pubsub done inbox=${inboxId} processed=${processed} skipped=${skipped}`);
  return { processed, skipped, inboxId };
}

export async function setupEmailWatch(inboxId?: string) {
  const inbox = inboxId
    ? await prisma.inbox.findUnique({ where: { id: inboxId } })
    : await resolveEmailInbox();
  if (!inbox) throw new Error("Email inbox not found");

  const config = asEmailConfig(inbox.channelConfig);
  if (!config) throw new Error("Inbox is not configured for email");
  if (!config.pubsubTopic) throw new Error("Email pubsubTopic missing");

  const gmail = getEmailClient(config);
  const watchRes = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: config.pubsubTopic,
      labelIds: ["INBOX"],
    },
  });

  const historyId = String(watchRes.data.historyId ?? "");
  const expiration = Number(watchRes.data.expiration ?? 0);

  await updateInboxConfig(inbox.id, inbox.channelConfig, {
    historyId,
    watchExpiration: expiration,
  });

  return {
    inboxId: inbox.id,
    historyId,
    watchExpiration: expiration,
    expiresAt: expiration ? new Date(expiration).toISOString() : null,
  };
}

/** @deprecated use setupEmailWatch */
export const setupGmailWatch = setupEmailWatch;

export async function renewEmailWatch(inboxId?: string) {
  const where: Prisma.InboxWhereInput = {
    channelType: "email",
    enabled: true,
  };
  if (inboxId) where.id = inboxId;

  const inboxes = await prisma.inbox.findMany({ where });
  const results: Array<{ inboxId: string; ok: boolean; error?: string; expiresAt?: string }> = [];

  for (const inbox of inboxes) {
    if (!asEmailConfig(inbox.channelConfig)) continue;
    try {
      const result = await setupEmailWatch(inbox.id);
      results.push({
        inboxId: inbox.id,
        ok: true,
        expiresAt: result.expiresAt ?? undefined,
      });
    } catch (err) {
      results.push({
        inboxId: inbox.id,
        ok: false,
        error: err instanceof Error ? err.message : "watch failed",
      });
    }
  }

  return results;
}

/** @deprecated use renewEmailWatch */
export const renewGmailWatch = renewEmailWatch;

async function updateInboxConfig(
  inboxId: string,
  existing: Prisma.JsonValue,
  patch: Record<string, unknown>,
) {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [key, value] of Object.entries(patch)) {
    base[key] = value;
  }
  // Normalize away legacy fields
  delete base.provider;
  delete base.smtpHost;
  delete base.smtpPort;
  delete base.smtpUser;
  delete base.smtpPass;
  delete base.fromAddress;
  delete base.fromName;

  await prisma.inbox.update({
    where: { id: inboxId },
    data: { channelConfig: base as Prisma.InputJsonValue },
  });
}
