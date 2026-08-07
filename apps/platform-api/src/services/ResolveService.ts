import { prisma } from "../config/db.js";

/** Customer.resolved = true iff every channel identity is resolved (or customer has none). */
export async function recomputeCustomerResolved(customerId: string): Promise<boolean> {
  const [wa, ig, em] = await Promise.all([
    prisma.whatsAppChannel.findMany({ where: { customerId }, select: { resolved: true } }),
    prisma.instagramChannel.findMany({ where: { customerId }, select: { resolved: true } }),
    prisma.emailChannel.findMany({ where: { customerId }, select: { resolved: true } }),
  ]);
  const all = [...wa, ...ig, ...em];
  const resolved = all.length === 0 ? false : all.every((r) => r.resolved);
  await prisma.customer.update({
    where: { id: customerId },
    data: { resolved },
  });
  return resolved;
}

export async function setChannelResolved(input: {
  channelType: "whatsapp" | "instagram" | "email";
  channelId: string;
  resolved: boolean;
}): Promise<{ customerId: string; customerResolved: boolean }> {
  if (input.channelType === "whatsapp") {
    const row = await prisma.whatsAppChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  if (input.channelType === "instagram") {
    const row = await prisma.instagramChannel.update({
      where: { id: input.channelId },
      data: { resolved: input.resolved },
    });
    const customerResolved = await recomputeCustomerResolved(row.customerId);
    return { customerId: row.customerId, customerResolved };
  }
  const row = await prisma.emailChannel.update({
    where: { id: input.channelId },
    data: { resolved: input.resolved },
  });
  const customerResolved = await recomputeCustomerResolved(row.customerId);
  return { customerId: row.customerId, customerResolved };
}

export async function resolveAllIdentitiesForCustomerChannel(input: {
  customerId: string;
  channelType: "whatsapp" | "instagram" | "email";
}): Promise<boolean> {
  if (input.channelType === "whatsapp") {
    await prisma.whatsAppChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else if (input.channelType === "instagram") {
    await prisma.instagramChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  } else {
    await prisma.emailChannel.updateMany({
      where: { customerId: input.customerId },
      data: { resolved: true },
    });
  }
  return recomputeCustomerResolved(input.customerId);
}
