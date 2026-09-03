import type { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/db.js";
import {
  bulkImportContacts,
  createCustomer,
  deleteCustomer,
  findMatchingCustomers,
  loadCustomerShaped,
  mergeCustomers,
  updateCustomer,
} from "../services/CustomerService.js";
import { shapeCustomer } from "../services/MessagingService.js";

export class ContactController {
  static async listContacts(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const customers = await prisma.customer.findMany({
        include: {
          whatsappIdentities: true,
          instagramIdentities: true,
          emailIdentities: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send(customers.map(shapeCustomer));
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }

  static async createContact(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        mergeIntoId?: string;
        keepName?: string;
        force?: boolean;
      };

      const emails = body.emails?.length
        ? body.emails
        : body.email
          ? [body.email]
          : [];
      const whatsappIds = body.whatsappIds?.length
        ? body.whatsappIds
        : body.whatsappId
          ? [body.whatsappId]
          : [];

      if (!body.force && !body.mergeIntoId) {
        const matches = await findMatchingCustomers({
          emails,
          whatsappIds,
          instagramId: body.instagramId,
        });
        if (matches.length) {
          return reply.code(409).send({
            error: "customer_match",
            message: "Customer found with matching channel ids",
            matches,
          });
        }
      }

      const result = await createCustomer({
        name: body.name,
        emails,
        whatsappIds,
        instagramId: body.instagramId,
        mergeIntoId: body.mergeIntoId,
        keepName: body.keepName ?? body.name,
        force: Boolean(body.force),
      });

      if (result && "needsMerge" in result && result.needsMerge) {
        return reply.code(409).send({
          error: "customer_match",
          message: "Customer found with matching channel ids",
          matches: result.matches,
        });
      }

      return reply.code(201).send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async updateContact(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const body = request.body as {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        mergeIntoId?: string;
        keepName?: string;
        force?: boolean;
      };
      const existing = await prisma.customer.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.code(404).send({ error: "not found" });

      // Prefer arrays when present (including empty = clear that channel list).
      const emails = Array.isArray(body.emails)
        ? body.emails
        : body.email !== undefined
          ? body.email
            ? [body.email]
            : []
          : undefined;
      const whatsappIds = Array.isArray(body.whatsappIds)
        ? body.whatsappIds
        : body.whatsappId !== undefined
          ? body.whatsappId
            ? [body.whatsappId]
            : []
          : undefined;

      if (!body.force && !body.mergeIntoId) {
        const matches = await findMatchingCustomers({
          emails: emails ?? [],
          whatsappIds: whatsappIds ?? [],
          instagramId: body.instagramId,
        });
        const others = matches.filter((m) => m.id !== request.params.id);
        if (others.length) {
          return reply.code(409).send({
            error: "customer_match",
            message: "Customer found with matching channel ids",
            matches: others,
          });
        }
      }

      const result = await updateCustomer(request.params.id, {
        name: body.name,
        emails,
        whatsappIds,
        instagramId: body.instagramId,
        mergeIntoId: body.mergeIntoId,
        keepName: body.keepName ?? body.name,
        force: Boolean(body.force),
      });

      if (result && "needsMerge" in result && result.needsMerge) {
        return reply.code(409).send({
          error: "customer_match",
          message: "Customer found with matching channel ids",
          matches: result.matches,
        });
      }

      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async merge(
    request: FastifyRequest<{
      Body: { targetId?: string; sourceIds?: string[]; keepName?: string };
    }>,
    reply: FastifyReply,
  ) {
    const { targetId, sourceIds, keepName } = request.body ?? {};
    if (!targetId || !sourceIds?.length || !keepName) {
      return reply.code(400).send({ error: "targetId, sourceIds, keepName required" });
    }
    try {
      const result = await mergeCustomers({ targetId, sourceIds, keepName });
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }

  static async getOne(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    const shaped = await loadCustomerShaped(request.params.id);
    if (!shaped) return reply.code(404).send({ error: "not found" });
    return reply.send(shaped);
  }

  static async deleteContact(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const result = await deleteCustomer(request.params.id);
      return reply.send(result);
    } catch (err: any) {
      const message = err?.message ?? "Failed to delete contact";
      const code = message === "Customer not found" ? 404 : 400;
      return reply.code(code).send({ error: message });
    }
  }

  static async bulkImport(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = request.body as {
        contacts: Array<{
          name?: string;
          whatsapp?: string;
          email?: string;
          instagram?: string;
        }>;
      };

      if (!Array.isArray(body?.contacts) || body.contacts.length === 0) {
        return reply.code(400).send({ error: "contacts array is required" });
      }

      if (body.contacts.length > 1000) {
        return reply.code(400).send({ error: "Maximum 1,000 contacts per import batch" });
      }

      const result = await bulkImportContacts(body.contacts);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  }
}
