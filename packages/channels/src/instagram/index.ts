import type {
  ChannelAdapter,
  InstagramChannelConfig,
  NormalizedInboundMessage,
  OutboundTextMessage,
  SendResult,
  WebhookVerifyQuery,
} from "../types.js";

const FB_GRAPH = "https://graph.facebook.com/v21.0";
const IG_GRAPH = "https://graph.instagram.com/v21.0";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isInstagramUserToken(token: string): boolean {
  return token.startsWith("IGAA") || token.startsWith("IGAAT");
}

function extractText(messaging: Record<string, unknown>): {
  content: string;
  contentType: NormalizedInboundMessage["contentType"];
} {
  const message = asRecord(messaging.message);
  if (!message) return { content: "", contentType: "unknown" };

  if (typeof message.text === "string") {
    return { content: message.text, contentType: "text" };
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const first = asRecord(attachments[0]);
  const type = String(first?.type ?? "unknown");
  if (type === "image") return { content: "[image]", contentType: "image" };
  if (type === "audio") return { content: "[audio]", contentType: "audio" };
  if (type === "video") return { content: "[video]", contentType: "video" };
  if (type === "file") return { content: "[file]", contentType: "file" };
  return { content: `[${type}]`, contentType: "unknown" };
}

function pushFromEvent(
  ev: Record<string, unknown>,
  out: NormalizedInboundMessage[],
) {
  const sender = asRecord(ev.sender);
  const message = asRecord(ev.message);
  if (!sender?.id || !message || message.is_echo) return;

  const { content, contentType } = extractText(ev);
  const mid = String(message.mid ?? message.id ?? `${sender.id}_${ev.timestamp ?? Date.now()}`);
  const ts = Number(ev.timestamp);
  out.push({
    externalId: mid,
    externalThreadId: String(sender.id),
    senderId: String(sender.id),
    senderName: undefined,
    content,
    contentType,
    occurredAt: Number.isFinite(ts) ? new Date(ts) : new Date(),
    raw: ev,
  });
}

export const instagramAdapter: ChannelAdapter<InstagramChannelConfig> = {
  channelType: "instagram",

  verifyWebhook(config, query: WebhookVerifyQuery) {
    const mode = query["hub.mode"] ?? query.mode;
    const token = query["hub.verify_token"] ?? query.verify_token;
    const challenge = query["hub.challenge"] ?? query.challenge;
    if (mode === "subscribe" && token && token === config.verifyToken && challenge) {
      return challenge;
    }
    return null;
  },

  parseInbound(_config, payload: unknown): NormalizedInboundMessage[] {
    const root = asRecord(payload);
    if (!root) return [];

    const entries = Array.isArray(root.entry) ? root.entry : [];
    const out: NormalizedInboundMessage[] = [];

    for (const entry of entries) {
      const entryObj = asRecord(entry);
      if (!entryObj) continue;

      // Instagram API with Instagram Login: entry.changes[].field === "messages"
      const changes = Array.isArray(entryObj.changes) ? entryObj.changes : [];
      for (const change of changes) {
        const changeObj = asRecord(change);
        const field = String(changeObj?.field ?? "");
        const value = asRecord(changeObj?.value);
        if (!value) continue;
        if (field === "messages" || value.message || value.sender) {
          pushFromEvent(value, out);
        }
      }

      // Messenger / Page-linked Instagram style: entry.messaging[]
      const messagingEvents = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
      for (const event of messagingEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }

      const standby = asRecord(entryObj.standby);
      const standbyEvents = Array.isArray(standby?.messaging) ? standby!.messaging : [];
      for (const event of standbyEvents) {
        const ev = asRecord(event);
        if (ev) pushFromEvent(ev, out);
      }
    }

    return out;
  },

  async sendMessage(config, message: OutboundTextMessage): Promise<SendResult> {
    if (config.mock) {
      return {
        ok: true,
        externalId: `mock_ig_${Date.now()}`,
        status: "mocked",
        raw: { to: message.to, content: message.content },
      };
    }

    if (!config.accessToken) {
      return { ok: false, status: "failed", error: "Instagram accessToken missing" };
    }

    const body = {
      recipient: { id: message.to },
      message: { text: message.content },
    };

    const useIgLogin = isInstagramUserToken(config.accessToken);
    const url = useIgLogin
      ? `${IG_GRAPH}/me/messages`
      : `${FB_GRAPH}/${config.pageId}/messages`;

    if (!useIgLogin && !config.pageId) {
      return { ok: false, status: "failed", error: "Instagram pageId/accessToken missing" };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          status: "failed",
          error: `Instagram API ${res.status}`,
          raw,
        };
      }
      const rawObj = asRecord(raw);
      return {
        ok: true,
        externalId: rawObj?.message_id ? String(rawObj.message_id) : undefined,
        status: "sent",
        raw,
      };
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        error: err instanceof Error ? err.message : "Instagram send failed",
      };
    }
  },
};
