import type { FastifyRequest, FastifyReply } from "fastify";
import { AccountService } from "../services/AccountService.js";
import { InboxService } from "../services/InboxService.js";

export class AccountController {
  static async createAccount(request: FastifyRequest<{ Body: { name?: string } }>, reply: FastifyReply) {
    const account = await AccountService.createAccount(request.body?.name);
    return reply.code(201).send(account);
  }

  static async listAccounts(_request: FastifyRequest, _reply: FastifyReply) {
    return AccountService.listAccounts();
  }

  static async listInboxes(
    request: FastifyRequest<{ Params: { accountId: string } }>,
    reply: FastifyReply,
  ) {
    return reply.send(await InboxService.listInboxes(request.params.accountId));
  }

  static async createInbox(
    request: FastifyRequest<{
      Params: { accountId: string };
      Body: {
        name?: string;
        channelType?: string;
        channelConfig?: Record<string, unknown>;
        enabled?: boolean;
      };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const inbox = await InboxService.createInbox(request.params.accountId, request.body ?? {});
      return reply.code(201).send(inbox);
    } catch (err: any) {
      if (err.message.includes("not found")) return reply.code(404).send({ error: err.message });
      return reply.code(400).send({ error: err.message });
    }
  }

  /** Legacy: PATCH /accounts/:accountId/channels/:channel → upsert inbox */
  static async updateChannel(
    request: FastifyRequest<{
      Params: { accountId: string; channel: "whatsapp" | "instagram" | "email" };
      Body: { enabled?: boolean; config?: Record<string, unknown> };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const inbox = await AccountService.updateChannel(
        request.params.accountId,
        request.params.channel,
        request.body ?? {},
      );
      return reply.code(200).send(inbox);
    } catch (err: any) {
      if (err.message.includes("not found")) return reply.code(404).send({ error: err.message });
      return reply.code(400).send({ error: err.message });
    }
  }
}
