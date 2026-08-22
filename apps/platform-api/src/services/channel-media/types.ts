import type { ChannelType, ContentType } from "../../generated/client/index.js";
import type { ChannelConfig, NormalizedInboundMessage, OutboundTextMessage } from "../../adapters/shared/types.js";

export type ParsedInboundMedia = {
  /** Provider media id (WhatsApp media id, Gmail attachment id, …). */
  providerMediaId?: string;
  /** Direct download URL (Instagram CDN, etc.). */
  url?: string;
  mimeType?: string;
  filename?: string;
  caption?: string;
  contentType: ContentType;
  /** Extra ids needed to fetch (e.g. Gmail message id). */
  meta?: Record<string, string>;
};

export type StoredMedia = {
  mediaKey: string;
  mimeType: string;
  filename?: string;
};

/** Per-channel media ingest + outbound hooks. Register new channels in registry.ts. */
export interface ChannelMediaHandler {
  readonly channelType: ChannelType;

  parseInboundRaw(raw: unknown): ParsedInboundMedia | null;

  persistInbound(input: {
    config: ChannelConfig;
    customerId: string;
    parsed: ParsedInboundMedia;
  }): Promise<StoredMedia | null>;

  /** Build channel-specific API payload when sending stored media. */
  buildOutboundWithMedia(input: {
    config: ChannelConfig;
    message: OutboundTextMessage;
    to: string;
    buffer: Buffer;
  }): Promise<Record<string, unknown>>;
}

export type InboundMediaResult = {
  content: string;
  contentType: ContentType;
  mediaKey?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
};

export async function resolveInboundMedia(
  handler: ChannelMediaHandler,
  input: {
    config: ChannelConfig;
    customerId: string;
    inbound: NormalizedInboundMessage;
  },
): Promise<InboundMediaResult | null> {
  const raw =
    input.inbound.raw && typeof input.inbound.raw === "object" && !Array.isArray(input.inbound.raw)
      ? input.inbound.raw
      : null;
  if (!raw) return null;

  const parsed = handler.parseInboundRaw(raw);
  if (!parsed) return null;

  let content = input.inbound.content;
  let contentType = parsed.contentType;
  if (parsed.caption?.trim()) content = parsed.caption.trim();
  else if (!content.trim() || content.startsWith("[")) {
    content = parsed.filename ?? content;
  }

  const stored = await handler.persistInbound({
    config: input.config,
    customerId: input.customerId,
    parsed,
  });

  return {
    content,
    contentType,
    mediaKey: stored?.mediaKey,
    mediaMimeType: stored?.mimeType,
    mediaFilename: stored?.filename,
  };
}
