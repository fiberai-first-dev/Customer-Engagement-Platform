import { prisma } from "../config/db.js";

export class MessageRepository {
  static findByConversationId(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
  }
}
