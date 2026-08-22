import type { ChannelType } from "../api";
import { uploadConversationAttachment as uploadAttachment } from "../api";

/** Channels with attachment send/receive enabled. Extend this list when adding handlers. */
const ATTACHMENT_CHANNELS: ReadonlySet<ChannelType> = new Set(["whatsapp"]);

export function channelSupportsAttachments(channel: ChannelType): boolean {
  return ATTACHMENT_CHANNELS.has(channel);
}

export { uploadAttachment as uploadConversationAttachment };
