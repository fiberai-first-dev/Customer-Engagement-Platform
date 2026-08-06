import type { ChannelAdapter, ChannelConfig, ChannelType } from "./types.js";
import { emailAdapter } from "../email/index.js";
import { instagramAdapter } from "../instagram/index.js";
import { whatsappAdapter } from "../whatsapp/index.js";
import { whatsappConfig } from "../whatsapp/config.js";
import { instagramConfig } from "../instagram/config.js";
import { emailConfig } from "../email/config.js";

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

/** Email channel uses Gmail — same as getChannelAdapter("email"). */
export function getEmailAdapter(_channelConfig?: unknown): ChannelAdapter {
  return emailAdapter as ChannelAdapter;
}

export function assertChannelConfig(
  _channelType: ChannelType,
  config: unknown,
): ChannelConfig {
  if (!config || typeof config !== "object") {
    throw new Error("channelConfig must be an object");
  }
  return config as ChannelConfig;
}

function mergeConfig<T extends Record<string, unknown>>(
  defaults: T,
  override: Record<string, unknown>,
): T {
  const merged: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(override)) {
    if (key === "mock") continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (key === "provider" || key.startsWith("smtp") || key.startsWith("imap")) continue;
    merged[key] = value;
  }
  delete merged.mock;
  delete merged.provider;
  return merged as T;
}

/**
 * Resolve effective channel config: per-account settings win, env defaults fill gaps.
 */
export function resolveChannelConfig(
  channelType: ChannelType,
  accountConfig: unknown,
): ChannelConfig {
  const raw =
    accountConfig && typeof accountConfig === "object" && !Array.isArray(accountConfig)
      ? (accountConfig as Record<string, unknown>)
      : {};

  if (channelType === "whatsapp") {
    return mergeConfig(
      { ...whatsappConfig } as Record<string, unknown>,
      raw,
    ) as unknown as ChannelConfig;
  }
  if (channelType === "instagram") {
    return mergeConfig(
      { ...instagramConfig } as Record<string, unknown>,
      raw,
    ) as unknown as ChannelConfig;
  }

  return mergeConfig(
    { ...emailConfig } as Record<string, unknown>,
    raw,
  ) as unknown as ChannelConfig;
}

export * from "./types.js";
export { whatsappAdapter } from "../whatsapp/index.js";
export { instagramAdapter } from "../instagram/index.js";
export {
  emailAdapter,
  getEmailClient,
  getGmailClient,
  extractEmailAddress,
  gmailAdapter,
} from "../email/index.js";
