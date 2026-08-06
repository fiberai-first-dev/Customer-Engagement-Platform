import { google, gmail_v1 } from "googleapis";
import { ulid } from "ulid";
import type {
  ChannelAdapter,
  EmailChannelConfig,
  NormalizedInboundMessage,
  OutboundTextMessage,
  SendResult,
} from "../shared/types.js";

export function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function getEmailClient(config: EmailChannelConfig): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({
    refresh_token: config.refreshToken,
    access_token: config.accessToken,
  });
  return google.gmail({ version: "v1", auth });
}

/** @deprecated use getEmailClient — email channel is Gmail */
export const getGmailClient = getEmailClient;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringField(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ""
  );
}

function decodeBodyData(data?: string | null): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    );
  } catch {
    return "";
  }
}

function extractBody(payload?: gmail_v1.Schema$MessagePart | null): string {
  if (!payload) return "";

  if (payload.body?.data) {
    const decoded = decodeBodyData(payload.body.data);
    if (decoded.trim()) return decoded;
  }

  const parts = payload.parts ?? [];
  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) {
    const decoded = decodeBodyData(plain.body.data);
    if (decoded.trim()) return decoded;
  }

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) {
    const decoded = decodeBodyData(html.body.data);
    if (decoded.trim()) {
      return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  for (const part of parts) {
    const nested = extractBody(part);
    if (nested.trim()) return nested;
  }

  return "";
}

function buildRawEmail(input: {
  to: string;
  from?: string;
  subject: string;
  content: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines = [
    `To: ${input.to}`,
    input.from ? `From: ${input.from}` : null,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references ? `References: ${input.references}` : null,
    "",
    input.content,
  ].filter((line): line is string => line != null);

  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

function parseGmailApiMessage(msg: gmail_v1.Schema$Message): NormalizedInboundMessage[] {
  const headers = msg.payload?.headers || [];
  const from = getHeader(headers, "from");
  if (!from) return [];

  const subject = getHeader(headers, "subject");
  const messageId = getHeader(headers, "message-id") || msg.id || "";
  const threadId = msg.threadId || extractEmailAddress(from);
  const senderEmail = extractEmailAddress(from);
  const body = extractBody(msg.payload) || msg.snippet || "";

  return [
    {
      externalId: messageId || `email_${msg.id ?? Date.now()}`,
      externalThreadId: threadId,
      senderId: senderEmail,
      senderEmail,
      senderName: from.includes("<")
        ? from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || undefined
        : undefined,
      content: body,
      contentType: "text",
      subject: subject || undefined,
      occurredAt: new Date(Number(msg.internalDate || Date.now())),
      raw: msg,
    },
  ];
}

/** Dev / simulate-inbound JSON shape */
function parseSimpleEmailPayload(payload: unknown): NormalizedInboundMessage[] {
  const root = asRecord(payload);
  if (!root) return [];

  const fromRaw =
    stringField(root, "from", "sender", "email", "fromEmail") ||
    (() => {
      const fromObj = asRecord(root.from);
      return fromObj ? stringField(fromObj, "email", "address") : "";
    })();

  if (!fromRaw) return [];

  const senderEmail = extractEmailAddress(fromRaw);
  const content =
    stringField(root, "text", "body", "content", "plain", "html") || "[email]";
  const subject = stringField(root, "subject") || undefined;
  const externalId =
    stringField(root, "id", "messageId", "message_id", "Message-Id") || `email_${ulid()}`;
  const threadId =
    stringField(root, "threadId", "thread_id", "inReplyTo", "In-Reply-To") || senderEmail;
  const fromName =
    stringField(root, "fromName", "name", "senderName") ||
    (fromRaw.includes("<") ? fromRaw.replace(/<[^>]+>/, "").trim() : undefined);

  return [
    {
      externalId,
      externalThreadId: threadId,
      senderId: senderEmail,
      senderName: fromName || undefined,
      senderEmail,
      content,
      contentType: "text",
      subject,
      occurredAt: new Date(),
      raw: payload,
    },
  ];
}

/**
 * Universal email channel adapter (Gmail API).
 * Also accepts CEP simulate-inbound JSON for local/dev.
 */
export const emailAdapter: ChannelAdapter<EmailChannelConfig> = {
  channelType: "email",

  parseInbound(_config, payload: unknown): NormalizedInboundMessage[] {
    const root = asRecord(payload);
    // Gmail API message objects have payload.headers / id / threadId
    if (root && (root.payload || (root.id && root.threadId) || root.labelIds)) {
      return parseGmailApiMessage(payload as gmail_v1.Schema$Message);
    }
    return parseSimpleEmailPayload(payload);
  },

  async sendMessage(config, message: OutboundTextMessage): Promise<SendResult> {
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
      return {
        ok: false,
        status: "failed",
        error: "Email (Gmail) clientId/clientSecret/refreshToken missing",
      };
    }

    try {
      const gmail = getEmailClient(config);
      const to = extractEmailAddress(message.to);
      const raw = buildRawEmail({
        to,
        subject: message.subject || "Message from FiberAI",
        content: message.content,
        inReplyTo: message.replyToExternalId,
        references: message.replyToExternalId ?? message.threadId,
      });

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          ...(message.threadId ? { threadId: message.threadId } : {}),
        },
      });

      return {
        ok: true,
        externalId: res.data.id || undefined,
        status: "sent",
        raw: res.data,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        error: err instanceof Error ? err.message : "Email send failed",
      };
    }
  },
};

/** @deprecated alias — email === gmail */
export const gmailAdapter = emailAdapter;
