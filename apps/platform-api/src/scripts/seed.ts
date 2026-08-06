import "../config/load-env.js";
import { Prisma } from "../generated/client/index.js";
import { ulid } from "ulid";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";

type ChannelType = "whatsapp" | "instagram" | "email";

async function ensureInbox(params: {
  accountId: string;
  name: string;
  channelType: ChannelType;
  enabled: boolean;
  channelConfig: Prisma.InputJsonValue;
  preferredId?: string;
}) {
  const existing =
    (params.preferredId
      ? await prisma.inbox.findUnique({ where: { id: params.preferredId } })
      : null) ??
    (await prisma.inbox.findFirst({
      where: { accountId: params.accountId, channelType: params.channelType, name: params.name },
    })) ??
    (await prisma.inbox.findFirst({
      where: { accountId: params.accountId, channelType: params.channelType },
    }));

  if (existing) {
    return prisma.inbox.update({
      where: { id: existing.id },
      data: {
        // Prefer stable preferred id path when recreating naming; keep existing id
        name: params.name,
        enabled: params.enabled,
        channelConfig: params.channelConfig,
      },
    });
  }

  return prisma.inbox.create({
    data: {
      id: params.preferredId ?? ulid(),
      accountId: params.accountId,
      name: params.name,
      channelType: params.channelType,
      enabled: params.enabled,
      channelConfig: params.channelConfig,
    },
  });
}

/** Remove legacy SMTP / duplicate Gmail inboxes — email channel is singular. */
async function cleanupLegacyEmailInboxes(accountId: string, keepId: string) {
  const emailInboxes = await prisma.inbox.findMany({
    where: { accountId, channelType: "email" },
  });
  for (const inbox of emailInboxes) {
    if (inbox.id === keepId) continue;
    await prisma.inbox.delete({ where: { id: inbox.id } });
    console.log("Removed legacy email inbox:", inbox.id, inbox.name);
  }
}

async function main() {
  let account = await prisma.account.findFirst({ include: { inboxes: true } });
  if (!account) {
    account = await prisma.account.create({
      data: { id: ulid(), name: "FiberAI" },
      include: { inboxes: true },
    });
    console.log("Created account:", account.id);
  } else {
    console.log("Using existing account:", account.id);
  }

  const whatsapp = await ensureInbox({
    accountId: account.id,
    name: "WhatsApp",
    channelType: "whatsapp",
    enabled: Boolean(env.whatsapp.accessToken && env.whatsapp.phoneNumberId),
    preferredId: `inbox_wa_${account.id}`,
    channelConfig: {
      phoneNumberId: env.whatsapp.phoneNumberId,
      accessToken: env.whatsapp.accessToken,
      verifyToken: env.whatsapp.verifyToken || "cep-wa-verify",
      appSecret: env.whatsapp.appSecret,
      businessAccountId: env.whatsapp.businessAccountId,
    } as Prisma.InputJsonValue,
  });

  const instagram = await ensureInbox({
    accountId: account.id,
    name: "Instagram",
    channelType: "instagram",
    enabled: Boolean(env.instagram.accessToken && env.instagram.pageId),
    preferredId: `inbox_ig_${account.id}`,
    channelConfig: {
      pageId: env.instagram.pageId,
      accessToken: env.instagram.accessToken,
      verifyToken: env.instagram.verifyToken || "cep-ig-verify",
      appSecret: env.instagram.appSecret,
      instagramAppId: env.instagram.appId,
      instagramUsername: env.instagram.username,
    } as Prisma.InputJsonValue,
  });

  // Single Email inbox (Gmail under the hood)
  const email = await ensureInbox({
    accountId: account.id,
    name: "Email",
    channelType: "email",
    enabled: Boolean(env.gmail.refreshToken || env.gmail.accessToken),
    preferredId: `inbox_em_${account.id}`,
    channelConfig: {
      clientId: env.gmail.clientId,
      clientSecret: env.gmail.clientSecret,
      refreshToken: env.gmail.refreshToken,
      accessToken: env.gmail.accessToken,
      pubsubTopic: env.gmail.pubsubTopic,
    } as Prisma.InputJsonValue,
  });

  await cleanupLegacyEmailInboxes(account.id, email.id);

  const base = env.publicBaseUrl.replace(/\/$/, "");
  console.log(
    JSON.stringify(
      {
        accountId: account.id,
        publicBaseUrl: base,
        note:
          base.includes("localhost") || base.includes("127.0.0.1")
            ? "PLATFORM_PUBLIC_BASE_URL is localhost — Meta/Gmail webhooks cannot reach this. Set your ngrok HTTPS URL."
            : "Use these callback URLs in Meta / Google Pub/Sub",
        inboxes: [
          {
            id: whatsapp.id,
            channel: "whatsapp",
            enabled: whatsapp.enabled,
            webhook: `${base}/webhooks/whatsapp`,
          },
          {
            id: instagram.id,
            channel: "instagram",
            enabled: instagram.enabled,
            webhook: `${base}/webhooks/instagram`,
            verifyTokenHint: "Must match INSTAGRAM_VERIFY_TOKEN in Meta app",
          },
          {
            id: email.id,
            channel: "email",
            enabled: email.enabled,
            pubsubPush: `${base}/webhooks/email/pubsub`,
            setupWatch: email.enabled
              ? `POST /api/v1/email/watch  (optional body: { "inboxId": "${email.id}" })`
              : "Add GMAIL_REFRESH_TOKEN then re-run npm run seed",
          },
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
