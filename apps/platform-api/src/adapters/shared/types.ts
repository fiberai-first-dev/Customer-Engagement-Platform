export type ChannelType = "whatsapp" | "instagram" | "email";

export type MessageContentType = "text" | "image" | "file" | "audio" | "video" | "unknown";

export interface WhatsAppChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  businessAccountId?: string;
}

export interface InstagramChannelConfig {
  /**
   * Legacy Facebook Page messaging only. Unused for Instagram Login
   * (`graph.instagram.com/me/messages`). Stripped on Settings save / Connect.
   */
  pageId?: string;
  accessToken: string;
  verifyToken: string;
  /** Instagram App Secret from Instagram > API setup with Instagram login */
  instagramAppSecret?: string;
  /** Instagram App ID from Instagram > API setup with Instagram login */
  instagramAppId?: string;
  instagramUsername?: string;
}

/** Email channel = Gmail (vendor assumed). */
export interface EmailChannelConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  pubsubTopic: string;
  /** Connected mailbox address (optional; used for Pub/Sub matching) */
  email?: string;
  historyId?: string;
  watchExpiration?: number;
}

export type ChannelConfig =
  | WhatsAppChannelConfig
  | InstagramChannelConfig
  | EmailChannelConfig;

export interface OutboundTextMessage {
  to: string;
  content: string;
  contentType?: MessageContentType;
  /** WhatsApp/IG template or reply-to metadata */
  replyToExternalId?: string;
  subject?: string;
  threadId?: string;
}

export interface SendResult {
  ok: boolean;
  externalId?: string;
  status: "sent" | "queued" | "failed";
  raw?: unknown;
  error?: string;
}

export interface InboundAttachment {
  url?: string;
  mimeType?: string;
  filename?: string;
}

export interface NormalizedInboundMessage {
  externalId: string;
  externalThreadId?: string;
  /** WhatsApp phone E.164, IG scoped id, email address */
  senderId: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  content: string;
  contentType: MessageContentType;
  subject?: string;
  attachments?: InboundAttachment[];
  occurredAt: Date;
  raw: unknown;
}

export interface WebhookVerifyQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
  mode?: string;
  verify_token?: string;
  challenge?: string;
}

export interface ChannelAdapter<TConfig extends ChannelConfig = ChannelConfig> {
  readonly channelType: ChannelType;
  verifyWebhook?(config: TConfig, query: WebhookVerifyQuery): string | null;
  parseInbound(config: TConfig, payload: unknown): NormalizedInboundMessage[];
  sendMessage(config: TConfig, message: OutboundTextMessage): Promise<SendResult>;
}
