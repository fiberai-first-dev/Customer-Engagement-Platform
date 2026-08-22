import type { ChannelType } from "../../generated/client/index.js";
import { whatsappChannelMedia } from "./whatsapp.js";
import type { ChannelMediaHandler } from "./types.js";

const handlers = new Map<ChannelType, ChannelMediaHandler>([
  ["whatsapp", whatsappChannelMedia],
]);

export function getChannelMediaHandler(
  channelType: ChannelType,
): ChannelMediaHandler | null {
  return handlers.get(channelType) ?? null;
}

export function channelSupportsAttachments(channelType: ChannelType): boolean {
  return handlers.has(channelType);
}
