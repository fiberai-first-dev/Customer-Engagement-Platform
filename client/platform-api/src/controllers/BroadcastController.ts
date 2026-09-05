import type { FastifyPluginAsync } from "fastify";
import { isFeatureEnabled } from "../services/FeatureService.js";
import { sendWhatsAppTemplateMessage } from "../services/MessagingService.js";
import { prisma } from "../config/db.js";

async function requireBroadcastEnabled() {
  const enabled = await isFeatureEnabled("broadcast_enabled", false);
  if (!enabled) {
    throw Object.assign(new Error("Broadcast feature is disabled for this workspace"), {
      statusCode: 403,
    });
  }
}

export const broadcastRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/broadcasts — send a template to multiple contacts
  app.post<{
    Body: {
      templateId: string;
      customerIds: string[];
      variables: Record<string, string>;
      /** Optional tag filter — if provided, only customers with this tag are included */
      tag?: string;
    };
  }>("/", async (req, reply) => {
    try {
      await requireBroadcastEnabled();

      const { templateId, customerIds: rawIds, variables, tag } = req.body;

      // If tag is provided, resolve customerIds from the tag (override / intersect with passed ids)
      let customerIds = rawIds;
      if (tag) {
        const taggedCustomers = await prisma.customer.findMany({
          where: {
            tag,
            whatsappIdentities: { some: {} },
          },
          select: { id: true },
        });
        const taggedIds = taggedCustomers.map((c) => c.id);
        // If rawIds were also provided, intersect; otherwise use all tagged
        customerIds =
          rawIds?.length
            ? taggedIds.filter((id) => rawIds.includes(id))
            : taggedIds;
      }

      if (!templateId || !Array.isArray(customerIds) || customerIds.length === 0) {
        return reply.code(400).send({ error: "templateId and customerIds (or a valid tag) are required" });
      }

      // Look up template name for logging
      const template = await prisma.whatsAppTemplate.findUnique({ where: { id: templateId } });
      if (!template) return reply.code(404).send({ error: "Template not found" });
      if (template.status !== "APPROVED") {
        return reply.code(400).send({ error: "Only APPROVED templates can be broadcast" });
      }

      // Persist broadcast job to DB as pending
      const job = await prisma.broadcastJob.create({
        data: {
          templateId,
          templateName: template.name,
          variables: variables as any,
          status: "pending",
          total: customerIds.length,
          succeeded: 0,
          failed: 0,
        },
      });

      // Start background processing
      (async () => {
        let succeeded = 0;
        let failed = 0;
        for (const customerId of customerIds) {
          // Small delay to respect Meta rate limits
          await new Promise((r) => setTimeout(r, 200));

          const customer = await prisma.customer.findUnique({ where: { id: customerId } }).catch(() => null);
          const customerName = customer?.name ?? null;

          try {
          // Resolve dynamic variables
          const resolvedVariables: Record<string, string> = {};
          const agentUsername = (req as any).user?.username ?? "Agent";
          
          for (const [key, val] of Object.entries(variables as Record<string, string>)) {
            if (val === "$CONTACT_NAME") {
              resolvedVariables[key] = customerName ?? "Customer";
            } else if (val === "$CONTACT_FIRST_NAME") {
              resolvedVariables[key] = customerName ? customerName.split(" ")[0] : "Customer";
            } else if (val === "$AGENT_USERNAME") {
              resolvedVariables[key] = agentUsername;
            } else {
              resolvedVariables[key] = val;
            }
          }

          const result = await sendWhatsAppTemplateMessage({ 
            customerId, 
            templateId, 
            variables: resolvedVariables 
          });
            if (result.result.ok) {
              succeeded++;
              await prisma.broadcastRecipient.create({
                data: {
                  jobId: job.id,
                  customerId,
                  customerName,
                  status: "sent",
                  messageId: result.result.externalId ?? null,
                },
              });
            } else {
              failed++;
              await prisma.broadcastRecipient.create({
                data: {
                  jobId: job.id,
                  customerId,
                  customerName,
                  status: "failed",
                  error: result.result.error ?? "Unknown error",
                },
              });
            }
          } catch (err: any) {
            failed++;
            await prisma.broadcastRecipient.create({
              data: {
                jobId: job.id,
                customerId,
                customerName,
                status: "failed",
                error: err.message ?? "Unknown error",
              },
            });
          }
          
          // Update job progress
          await prisma.broadcastJob.update({
            where: { id: job.id },
            data: { succeeded, failed },
          });
        }

        const overallStatus = failed === 0 ? "completed" : succeeded === 0 ? "failed" : "partial";
        await prisma.broadcastJob.update({
          where: { id: job.id },
          data: { status: overallStatus, succeeded, failed },
        });
      })().catch((err) => {
        req.log.error(err, "Background broadcast job failed");
      });

      return reply.send({
        jobId: job.id,
        total: customerIds.length,
        succeeded: 0,
        failed: 0,
        status: "pending",
        results: [],
      });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });

  // GET /api/v1/broadcasts — list past broadcast jobs
  app.get("/", async (req, reply) => {
    try {
      await requireBroadcastEnabled();
      const jobs = await prisma.broadcastJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          recipients: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return reply.send({ jobs });
    } catch (err: any) {
      req.log.error(err);
      const status = err.statusCode ?? 500;
      return reply.status(status).send({ error: err.message });
    }
  });
};
