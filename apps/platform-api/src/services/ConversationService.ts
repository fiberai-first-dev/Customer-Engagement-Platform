import { ConversationRepository } from "../repositories/ConversationRepository.js";
import { MessageRepository } from "../repositories/MessageRepository.js";
import { sendConversationMessage } from "./MessagingService.js";

export class ConversationService {
  static async listConversations(query: {
    accountId?: string;
    inboxId?: string;
    status?: string;
  }) {
    const { accountId, inboxId, status } = query;
    return ConversationRepository.findMany({
      accountId: accountId || undefined,
      inboxId: inboxId || undefined,
      status:
        status === "open" || status === "pending" || status === "resolved"
          ? status
          : undefined,
    });
  }

  static async getConversation(id: string) {
    const conversation = await ConversationRepository.findById(id);
    if (!conversation) throw new Error("not found");
    return conversation;
  }

  static async getMessages(conversationId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("not found");
    return MessageRepository.findByConversationId(conversationId);
  }

  static async sendMessage(conversationId: string, content: string, subject?: string) {
    return sendConversationMessage({ conversationId, content, subject });
  }

  static async updateStatus(id: string, status: string) {
    if (status !== "open" && status !== "pending" && status !== "resolved") {
      throw new Error("invalid status");
    }
    try {
      return await ConversationRepository.updateStatus(id, status);
    } catch {
      throw new Error("not found");
    }
  }
}
