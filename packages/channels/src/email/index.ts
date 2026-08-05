import nodemailer from "nodemailer";
import type {
  ChannelAdapter,
  EmailChannelConfig,
  NormalizedInboundMessage,
  OutboundTextMessage,
  SendResult,
} from "../types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** Normalize common inbound email provider payloads (SendGrid/Mailgun/generic). */
function parseProviderPayload(payload: unknown): NormalizedInboundMessage[] {
  const root = asRecord(payload);
  if (!root) return [];

  // Generic CEP simulate / custom webhook
  if (root.from && (root.text || root.html || root.subject)) {
    const from = String(root.from);
    const content = String(root.text ?? root.html ?? "");
    const externalId = String(root.messageId ?? root.id ?? `email_${Date.now()}`);
    return [
      {
        externalId,
        externalThreadId: String(root.threadId ?? from),
        senderId: from,
        senderEmail: from,
        senderName: firstString(root.fromName, root.name),
        content,
        contentType: "text",
        subject: firstString(root.subject),
        occurredAt: root.date ? new Date(String(root.date)) : new Date(),
        raw: payload,
      },
    ];
  }

  // SendGrid Inbound Parse style
  if (root.from && (root.text || root.html)) {
    const from = String(root.from);
    return [
      {
        externalId: String(root.headers ?? root.envelope ?? `sg_${Date.now()}`).slice(0, 200),
        externalThreadId: from,
        senderId: from,
        senderEmail: from,
        content: String(root.text ?? root.html ?? ""),
        contentType: "text",
        subject: firstString(root.subject),
        occurredAt: new Date(),
        raw: payload,
      },
    ];
  }

  // Mailgun style
  if (root.sender || root["from"]) {
    const from = String(root.sender ?? root["from"]);
    const bodyPlain = firstString(root["body-plain"], root["stripped-text"], root.text) ?? "";
    return [
      {
        externalId: String(root["Message-Id"] ?? root["message-id"] ?? `mg_${Date.now()}`),
        externalThreadId: from,
        senderId: from,
        senderEmail: from,
        content: bodyPlain,
        contentType: "text",
        subject: firstString(root.subject),
        occurredAt: new Date(),
        raw: payload,
      },
    ];
  }

  return [];
}

export const emailAdapter: ChannelAdapter<EmailChannelConfig> = {
  channelType: "email",

  parseInbound(_config, payload: unknown): NormalizedInboundMessage[] {
    return parseProviderPayload(payload);
  },

  async sendMessage(config, message: OutboundTextMessage): Promise<SendResult> {
    if (config.mock) {
      return {
        ok: true,
        externalId: `mock_email_${Date.now()}`,
        status: "mocked",
        raw: {
          to: message.to,
          subject: message.subject ?? "(no subject)",
          content: message.content,
        },
      };
    }

    if (!config.smtpHost || !config.fromAddress) {
      return { ok: false, status: "failed", error: "Email SMTP config incomplete" };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: Boolean(config.smtpSecure),
        auth: config.smtpUser
          ? { user: config.smtpUser, pass: config.smtpPass }
          : undefined,
      });

      const info = await transporter.sendMail({
        from: config.fromName
          ? `"${config.fromName}" <${config.fromAddress}>`
          : config.fromAddress,
        to: message.to,
        subject: message.subject ?? "Message from support",
        text: message.content,
      });

      return {
        ok: true,
        externalId: info.messageId,
        status: "sent",
        raw: info,
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
