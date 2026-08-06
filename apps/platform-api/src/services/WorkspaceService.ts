import { Prisma } from "../generated/client/index.js";
import { ulid } from "ulid";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { mergeChannelConfig } from "./MessagingService.js";

type ChannelType = "whatsapp" | "instagram" | "email";

function pickFilled(values: Record<string, string | undefined | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    // Skip placeholder examples from .env.example-style values
    if (trimmed.startsWith("your_")) continue;
    out[key] = trimmed;
  }
  return out;
}

/** Non-empty channel credentials from .env — empty keys are omitted so DB/OAuth values stay. */
export function channelConfigFromEnv(channel: ChannelType): Record<string, string> {
  if (channel === "whatsapp") {
    return pickFilled({
      phoneNumberId: env.whatsapp.phoneNumberId,
      accessToken: env.whatsapp.accessToken,
      verifyToken: env.whatsapp.verifyToken,
      appSecret: env.whatsapp.appSecret,
      businessAccountId: env.whatsapp.businessAccountId,
    });
  }
  if (channel === "instagram") {
    return pickFilled({
      pageId: env.instagram.pageId,
      accessToken: env.instagram.accessToken,
      verifyToken: env.instagram.verifyToken,
      appSecret: env.instagram.appSecret,
      instagramAppId: env.instagram.appId,
      instagramUsername: env.instagram.username,
    });
  }
  return pickFilled({
    clientId: env.gmail.clientId,
    clientSecret: env.gmail.clientSecret,
    refreshToken: env.gmail.refreshToken,
    accessToken: env.gmail.accessToken,
    pubsubTopic: env.gmail.pubsubTopic,
  });
}

function configObject(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function hasChannelCreds(channel: ChannelType, config: Record<string, unknown>): boolean {
  const s = (key: string) => {
    const v = config[key];
    return typeof v === "string" && v.trim().length > 0 && v !== "***";
  };
  if (channel === "whatsapp") return s("phoneNumberId") && s("accessToken");
  if (channel === "instagram") return s("accessToken") && s("verifyToken");
  return (s("refreshToken") || s("accessToken")) && s("clientId") && s("clientSecret");
}

function filledKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).filter((k) => {
    const v = config[k];
    return typeof v === "string" && v.trim().length > 0 && v !== "***";
  });
}

/**
 * Ensure one account + WhatsApp / Instagram / Email inboxes.
 * On every boot: merge non-empty .env channel credentials into inbox.channelConfig.
 * Empty .env keys do not wipe Settings/OAuth values (historyId, tokens, etc.).
 */
export async function ensureWorkspace() {
  let account = await prisma.account.findFirst();
  if (!account) {
    account = await prisma.account.create({
      data: { id: ulid(), name: "Workspace" },
    });
    console.log(`[workspace] created account ${account.id}`);
  }

  for (const channel of ["whatsapp", "instagram", "email"] as ChannelType[]) {
    const name =
      channel === "whatsapp" ? "WhatsApp" : channel === "instagram" ? "Instagram" : "Email";
    const preferredId =
      channel === "whatsapp"
        ? `inbox_wa_${account.id}`
        : channel === "instagram"
          ? `inbox_ig_${account.id}`
          : `inbox_em_${account.id}`;

    const existing =
      (await prisma.inbox.findUnique({ where: { id: preferredId } })) ??
      (await prisma.inbox.findFirst({
        where: { accountId: account.id, channelType: channel },
      }));

    const fromEnv = channelConfigFromEnv(channel);
    const before = configObject(existing?.channelConfig);
    const nextConfig = mergeChannelConfig(existing?.channelConfig ?? {}, fromEnv);
    const after = configObject(nextConfig);
    const ready = hasChannelCreds(channel, after);
    const envKeys = Object.keys(fromEnv);
    const synced = envKeys.filter((k) => before[k] !== fromEnv[k]);

    if (existing) {
      await prisma.inbox.update({
        where: { id: existing.id },
        data: {
          name,
          channelConfig: nextConfig,
          enabled: ready || existing.enabled,
        },
      });
      if (synced.length) {
        console.log(
          `[workspace] ${channel} inbox=${existing.id} updated from .env (${synced.join(", ")}) keys=${filledKeys(after).join(",")}`,
        );
      } else if (envKeys.length) {
        console.log(
          `[workspace] ${channel} inbox=${existing.id} .env already in sync keys=${filledKeys(after).join(",")}`,
        );
      } else {
        console.log(
          `[workspace] ${channel} inbox=${existing.id} no filled .env channel vars (DB/OAuth kept) keys=${filledKeys(after).join(",") || "(none)"}`,
        );
      }
      continue;
    }

    await prisma.inbox.create({
      data: {
        id: preferredId,
        accountId: account.id,
        name,
        channelType: channel,
        enabled: ready,
        channelConfig: nextConfig,
      },
    });
    console.log(
      `[workspace] created ${channel} inbox=${preferredId}` +
        (envKeys.length
          ? ` from .env (${envKeys.join(", ")})`
          : " (empty — fill Settings or .env)"),
    );
  }

  return account;
}
