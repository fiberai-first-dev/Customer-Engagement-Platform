import { Prisma } from "../generated/client/index.js";
import { ulid } from "ulid";
import { prisma } from "../config/db.js";

type ChannelType = "whatsapp" | "instagram" | "email";

/**
 * Ensure one account + empty WhatsApp / Instagram / Email inboxes exist.
 * Never overwrites existing channelConfig (vendors configure in Settings).
 */
export async function ensureWorkspace() {
  let account = await prisma.account.findFirst();
  if (!account) {
    account = await prisma.account.create({
      data: { id: ulid(), name: "Workspace" },
    });
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

    if (existing) {
      if (existing.name !== name) {
        await prisma.inbox.update({ where: { id: existing.id }, data: { name } });
      }
      continue;
    }

    await prisma.inbox.create({
      data: {
        id: preferredId,
        accountId: account.id,
        name,
        channelType: channel,
        enabled: false,
        channelConfig: {} as Prisma.InputJsonValue,
      },
    });
  }

  return account;
}
