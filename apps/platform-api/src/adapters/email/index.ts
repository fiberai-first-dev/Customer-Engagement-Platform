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

/** True for RFC Message-IDs; false for Gmail API opaque ids used as Message.externalId. */
export function looksLikeRfcMessageId(value: string): boolean {
  const v = value.trim();
  return v.includes("@") || (v.startsWith("<") && v.endsWith(">"));
}

/**
 * Pull email-client threading fields from a stored Gmail API message (rawPayload).
 * Gmail API `id` / `threadId` are separate from RFC Message-ID headers.
 */
export function extractEmailThreading(raw: unknown): {
  rfcMessageId?: string;
  references?: string;
  gmailThreadId?: string;
} {
  const msg = asRecord(raw);
  if (!msg) return {};

  const gmailThreadId =
    typeof msg.threadId === "string" && msg.threadId.trim()
      ? msg.threadId.trim()
      : undefined;

  const payload = asRecord(msg.payload);
  const headers = Array.isArray(payload?.headers)
    ? (payload.headers as gmail_v1.Schema$MessagePartHeader[])
    : undefined;

  const rfcMessageId = getHeader(headers, "message-id").trim() || undefined;
  const references = getHeader(headers, "references").trim() || undefined;

  return { rfcMessageId, references, gmailThreadId };
}

/** Build References for a reply: prior chain + parent Message-ID. */
export function buildReplyReferences(
  parentMessageId?: string,
  parentReferences?: string,
): string | undefined {
  if (!parentMessageId) return parentReferences || undefined;
  if (!parentReferences) return parentMessageId;
  if (parentReferences.includes(parentMessageId)) return parentReferences;
  return `${parentReferences} ${parentMessageId}`;
}

function parseGmailApiMessage(msg: gmail_v1.Schema$Message): NormalizedInboundMessage[] {
  const headers = msg.payload?.headers || [];
  const labels = msg.labelIds ?? [];
  const from = getHeader(headers, "from");
  const toHeader = getHeader(headers, "to");
  if (!from && !toHeader) return [];

  const subject = getHeader(headers, "subject");
  // Prefer Gmail API id so CEP-sent mail (stored with users.messages.send id) dedupes on SENT sync.
  const gmailId = msg.id?.trim() || "";
  const headerMessageId = getHeader(headers, "message-id");
  const messageId = gmailId || headerMessageId || "";
  const body = extractBody(msg.payload) || msg.snippet || "";

  const isSentOnly = labels.includes("SENT") && !labels.includes("INBOX");
  if (isSentOnly) {
    const peerRaw = toHeader.split(",")[0]?.trim() || "";
    if (!peerRaw) return [];
    const peerEmail = extractEmailAddress(peerRaw);
    if (!peerEmail) return [];
    return [
      {
        externalId: messageId || `email_${Date.now()}`,
        externalThreadId: msg.threadId || peerEmail,
        senderId: peerEmail,
        peerId: peerEmail,
        senderEmail: peerEmail,
        senderName: peerRaw.includes("<")
          ? peerRaw.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || undefined
          : undefined,
        direction: "outgoing",
        content: body,
        contentType: "text",
        subject: subject || undefined,
        occurredAt: new Date(Number(msg.internalDate || Date.now())),
        raw: msg,
      },
    ];
  }

  if (!from) return [];
  const senderEmail = extractEmailAddress(from);
  const threadId = msg.threadId || senderEmail;

  return [
    {
      externalId: messageId || `email_${Date.now()}`,
      externalThreadId: threadId,
      senderId: senderEmail,
      senderEmail,
      senderName: from.includes("<")
        ? from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || undefined
        : undefined,
      direction: "incoming",
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

      // Only put RFC Message-IDs in MIME headers. Gmail API ids break client threading.
      const inReplyTo =
        message.replyToExternalId && looksLikeRfcMessageId(message.replyToExternalId)
          ? message.replyToExternalId
          : undefined;
      const references =
        message.references &&
        (looksLikeRfcMessageId(message.references.split(/\s+/).pop() || "") ||
          message.references.includes("@"))
          ? message.references
          : inReplyTo;

      const raw = buildRawEmail({
        to,
        subject: message.subject || "Message from FiberAI",
        content: message.content,
        inReplyTo,
        references,
      });

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          ...(message.threadId ? { threadId: message.threadId } : {}),
        },
      });

      // Enrich with Message-ID so later CEP replies can chain In-Reply-To correctly.
      let sentRaw: gmail_v1.Schema$Message = res.data;
      if (res.data.id) {
        try {
          const full = await gmail.users.messages.get({
            userId: "me",
            id: res.data.id,
            format: "metadata",
            metadataHeaders: ["Message-ID", "References", "In-Reply-To", "Subject"],
          });
          if (full.data) sentRaw = full.data;
        } catch {
          // send already succeeded; metadata fetch is best-effort
        }
      }

      return {
        ok: true,
        externalId: res.data.id || undefined,
        status: "sent",
        raw: sentRaw,
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
