import { prisma } from "../config/db.js";
import type { ChannelType, Prisma } from "../generated/client/index.js";

export class InboxRepository {
  static findByAccountId(accountId: string) {
    return prisma.inbox.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" },
    });
  }

  static findById(id: string) {
    return prisma.inbox.findUnique({ where: { id } });
  }

  static findByAccountAndChannel(accountId: string, channelType: ChannelType) {
    return prisma.inbox.findFirst({
      where: { accountId, channelType },
      orderBy: { createdAt: "asc" },
    });
  }

  static findEnabledByChannel(channelType: ChannelType) {
    return prisma.inbox.findMany({
      where: { channelType, enabled: true },
      orderBy: { createdAt: "asc" },
    });
  }

  static create(data: Prisma.InboxCreateInput | Prisma.InboxUncheckedCreateInput) {
    return prisma.inbox.create({ data });
  }

  static update(id: string, data: Prisma.InboxUpdateInput) {
    return prisma.inbox.update({ where: { id }, data });
  }
}
