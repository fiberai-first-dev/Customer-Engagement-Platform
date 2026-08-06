import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  contactIdentifiersFromRow,
  contactToIdentities,
} from "../services/MessagingService.js";

export class ContactController {
  static async listContacts(
    request: FastifyRequest<{ Querystring: { accountId?: string } }>,
    reply: FastifyReply,
  ) {
    const { accountId } = request.query;

    try {
      const contacts = await prisma.contact.findMany({
        where: accountId ? { accountId } : undefined,
        orderBy: { updatedAt: "desc" },
      });

      return reply.send(
        contacts.map((c) => {
          const identities = contactToIdentities(c);
          return {
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            whatsappEnabled: c.whatsappEnabled,
            instagramEnabled: c.instagramEnabled,
            emailEnabled: c.emailEnabled,
            identifiers: contactIdentifiersFromRow(c),
            identities: identities.map((identity) => ({
              id: identity.id,
              channel: identity.channel,
              externalId: identity.externalId,
              metadata: identity.metadata,
              enabled: identity.enabled,
            })),
          };
        }),
      );
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
