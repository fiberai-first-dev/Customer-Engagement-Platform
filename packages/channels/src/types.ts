export type ChannelType = "whatsapp" | "instagram" | "email";

export type MessageContentType = "text" | "image" | "file" | "audio" | "video" | "unknown";

export interface WhatsAppChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  businessAccountId?: string;
  /** When true, send/receive are logged only (no Meta API). */
  mock?: boolean;
}

export interface InstagramChannelConfig {
  /** Instagram professional account id (user_id) or Facebook Page id */
  pageId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  /** Instagram Login API app id (optional) */
  instagramAppId?: string;
  instagramUsername?: string;
  mock?: boolean;
}

export interface EmailChannelConfig {
  /** SMTP for outbound */
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPass: string;
  fromAddress: string;
  fromName?: string;
  /** Optional IMAP for inbound polling */
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser?: string;
  imapPass?: string;
  /** Shared secret for provider inbound webhooks (SendGrid/Mailgun style) */
  inboundWebhookSecret?: string;
  mock?: boolean;
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
}

export interface SendResult {
  ok: boolean;
  externalId?: string;
  status: "sent" | "queued" | "failed" | "mocked";
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
