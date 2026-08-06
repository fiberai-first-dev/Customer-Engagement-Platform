import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  asStringList,
  contactIdentifiersFromRow,
  contactToIdentities,
  withPrimaryAndLists,
} from "../services/MessagingService.js";
import { ulid } from "ulid";

function shapeContact(c: {
  id: string;
  name: string | null;
  email: string | null;
  emails?: unknown;
  whatsappEnabled: boolean;
  instagramEnabled: boolean;
  emailEnabled: boolean;
  whatsappId?: string | null;
  whatsappIds?: unknown;
  instagramId?: string | null;
  emailId?: string | null;
  whatsappDetails?: unknown;
  instagramDetails?: unknown;
  emailDetails?: unknown;
}) {
  const emails = asStringList(c.emails);
  const whatsappIds = asStringList(c.whatsappIds);
  const identities = contactToIdentities(c as never);
  return {
    id: c.id,
    name: c.name,
    email: c.email ?? emails[0] ?? null,
    emails: emails.length ? emails : c.email ? [c.email] : [],
    whatsappId: c.whatsappId ?? whatsappIds[0] ?? null,
    whatsappIds: whatsappIds.length
      ? whatsappIds
      : c.whatsappId
        ? [c.whatsappId]
        : [],
    whatsappEnabled: c.whatsappEnabled,
    instagramEnabled: c.instagramEnabled,
    emailEnabled: c.emailEnabled,
    identifiers: contactIdentifiersFromRow(c as never),
    identities: identities.map((identity) => ({
      id: identity.id,
      channel: identity.channel,
      externalId: identity.externalId,
      metadata: identity.metadata,
      enabled: identity.enabled,
    })),
  };
}

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

      return reply.send(contacts.map(shapeContact));
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async createContact(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        accountId?: string;
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        emailId?: string;
      };

      if (!body.accountId) {
        return reply.code(400).send({ error: "accountId is required" });
      }

      const lists = withPrimaryAndLists({
        emails: body.emails,
        whatsappIds: body.whatsappIds,
        email: body.email ?? body.emailId,
        whatsappId: body.whatsappId,
      });

      const contact = await prisma.contact.create({
        data: {
          id: ulid(),
          accountId: body.accountId,
          name: body.name,
          email: lists.email,
          emails: lists.emails,
          whatsappId: lists.whatsappId,
          whatsappIds: lists.whatsappIds,
          instagramId: body.instagramId || null,
          emailId: body.emailId || lists.emails[0] || null,
          whatsappEnabled: false,
          instagramEnabled: false,
          emailEnabled: false,
        },
      });

      return reply.code(201).send(shapeContact(contact));
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async updateContact(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { id } = request.params;
      const body = request.body as {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        emailId?: string;
      };

      const lists = withPrimaryAndLists({
        emails: body.emails,
        whatsappIds: body.whatsappIds,
        email: body.email ?? body.emailId,
        whatsappId: body.whatsappId,
      });

      const contact = await prisma.contact.update({
        where: { id },
        data: {
          name: body.name,
          email: lists.email,
          emails: lists.emails,
          whatsappId: lists.whatsappId,
          whatsappIds: lists.whatsappIds,
          instagramId: body.instagramId !== undefined ? body.instagramId || null : undefined,
          emailId: body.emailId !== undefined ? body.emailId || lists.emails[0] || null : undefined,
        },
      });

      return reply.send(shapeContact(contact));
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.code(404).send({ error: "Contact not found" });
      }
      return reply.code(500).send({ error: err.message });
    }
  }
}
