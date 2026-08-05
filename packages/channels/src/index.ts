import type { ChannelAdapter, ChannelConfig, ChannelType } from "./types.js";
import { emailAdapter } from "./email/index.js";
import { instagramAdapter } from "./instagram/index.js";
import { whatsappAdapter } from "./whatsapp/index.js";

const adapters: Record<ChannelType, ChannelAdapter> = {
  whatsapp: whatsappAdapter as ChannelAdapter,
  instagram: instagramAdapter as ChannelAdapter,
  email: emailAdapter as ChannelAdapter,
};

export function getChannelAdapter(channelType: ChannelType): ChannelAdapter {
  const adapter = adapters[channelType];
  if (!adapter) {
    throw new Error(`Unsupported channel: ${channelType}`);
  }
  return adapter;
}

export function assertChannelConfig(
  channelType: ChannelType,
  config: unknown,
): ChannelConfig {
  if (!config || typeof config !== "object") {
    throw new Error("channelConfig must be an object");
  }
  return config as ChannelConfig;
}

export * from "./types.js";
export { whatsappAdapter } from "./whatsapp/index.js";
export { instagramAdapter } from "./instagram/index.js";
export { emailAdapter } from "./email/index.js";
