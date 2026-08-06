import type {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundTextMessage,
  SendResult,
  WebhookVerifyQuery,
  WhatsAppChannelConfig,
} from "../shared/types.js";

const GRAPH = "https://graph.facebook.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textFromMessage(msg: Record<string, unknown>): {
  content: string;
  contentType: NormalizedInboundMessage["contentType"];
} {
  const type = typeof msg.type === "string" ? msg.type : "unknown";
  if (type === "text") {
    const text = asRecord(msg.text);
    return { content: String(text?.body ?? ""), contentType: "text" };
  }
  if (type === "image") {
    const image = asRecord(msg.image);
    return {
      content: String(image?.caption ?? "[image]"),
      contentType: "image",
    };
  }
  if (type === "audio") return { content: "[audio]", contentType: "audio" };
  if (type === "video") return { content: "[video]", contentType: "video" };
  if (type === "document") {
    const doc = asRecord(msg.document);
    return {
      content: String(doc?.filename ?? "[file]"),
      contentType: "file",
    };
  }
  return { content: `[${type}]`, contentType: "unknown" };
}

export const whatsappAdapter: ChannelAdapter<WhatsAppChannelConfig> = {
  channelType: "whatsapp",

  verifyWebhook(config: WhatsAppChannelConfig, query: WebhookVerifyQuery) {
    const mode = query["hub.mode"] ?? query.mode;
    const token = query["hub.verify_token"] ?? query.verify_token;
    const challenge = query["hub.challenge"] ?? query.challenge;
    if (mode === "subscribe" && token && token === config.verifyToken && challenge) {
      return challenge;
    }
    return null;
  },

  parseInbound(_config: WhatsAppChannelConfig, payload: unknown): NormalizedInboundMessage[] {
    const root = asRecord(payload);
    if (!root) return [];

    const entries = Array.isArray(root.entry) ? root.entry : [];
    const out: NormalizedInboundMessage[] = [];

    for (const entry of entries) {
      const entryObj = asRecord(entry);
      const changes = Array.isArray(entryObj?.changes) ? entryObj!.changes : [];
      for (const change of changes) {
        const changeObj = asRecord(change);
        const value = asRecord(changeObj?.value);
        if (!value) continue;

        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const contactNameByWaId = new Map<string, string>();
        for (const c of contacts) {
          const cObj = asRecord(c);
          const profile = asRecord(cObj?.profile);
          const waId = String(cObj?.wa_id ?? "");
          if (waId && profile?.name) contactNameByWaId.set(waId, String(profile.name));
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const msg = asRecord(message);
          if (!msg?.id || !msg.from) continue;
          const from = String(msg.from);
          const { content, contentType } = textFromMessage(msg);
          const ts = Number(msg.timestamp);
          out.push({
            externalId: String(msg.id),
            externalThreadId: from,
            senderId: from,
            senderName: contactNameByWaId.get(from),
            senderPhone: from.startsWith("+") ? from : `+${from}`,
            content,
            contentType,
            occurredAt: Number.isFinite(ts) ? new Date(ts * 1000) : new Date(),
            raw: msg,
          });
        }
      }
    }

    return out;
  },

  async sendMessage(config: WhatsAppChannelConfig, message: OutboundTextMessage): Promise<SendResult> {
    if (!config.phoneNumberId || !config.accessToken) {
      return { ok: false, status: "failed", error: "WhatsApp phoneNumberId/accessToken missing" };
    }

    const to = message.to.replace(/[^\d]/g, "");
    if (!to) {
      return { ok: false, status: "failed", error: "WhatsApp recipient missing" };
    }
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: message.content },
    };

    try {
      const res = await fetch(`${GRAPH}/${config.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawObj = asRecord(raw);
        const err = asRecord(rawObj?.error);
        const detail =
          typeof err?.message === "string" && err.message
            ? err.message
            : `WhatsApp API ${res.status}`;
        return {
          ok: false,
          status: "failed",
          error: detail,
          raw,
        };
      }
      const rawObj = asRecord(raw);
      const messages = Array.isArray(rawObj?.messages) ? rawObj!.messages : [];
      const first = asRecord(messages[0]);
      return {
        ok: true,
        externalId: first?.id ? String(first.id) : undefined,
        status: "sent",
        raw,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        error: err instanceof Error ? err.message : "WhatsApp send failed",
      };
    }
  },
};
