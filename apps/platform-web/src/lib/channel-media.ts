import type { ChannelType } from "../api";
import { uploadConversationAttachment as uploadAttachment } from "../api";

/** Channels with attachment send/receive enabled (matches API channel-media registry). */
const ATTACHMENT_CHANNELS: ReadonlySet<ChannelType> = new Set([
  "whatsapp",
  "instagram",
  "email",
]);

export function channelSupportsAttachments(channel: ChannelType): boolean {
  return ATTACHMENT_CHANNELS.has(channel);
}

export { uploadAttachment as uploadConversationAttachment };
