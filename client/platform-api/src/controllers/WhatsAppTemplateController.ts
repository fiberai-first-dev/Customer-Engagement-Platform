import type { FastifyPluginAsync } from "fastify";
import { WhatsAppTemplateService } from "../services/WhatsAppTemplateService.js";
import { isFeatureEnabled } from "../services/FeatureService.js";

async function requireTemplatesEnabled() {
  const enabled = await isFeatureEnabled("whatsapp_templates_enabled", false);
  if (!enabled) {
    throw new Error("WhatsApp Templates are disabled for this workspace");
  }
}

export const whatsAppTemplateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const templates = await WhatsAppTemplateService.listTemplates();
      return reply.send({ templates });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post("/sync", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const templates = await WhatsAppTemplateService.syncTemplatesFromMeta();
      return reply.send({ templates });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post("/", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const body = req.body as any;
      const template = await WhatsAppTemplateService.createTemplate({
        name: body.name,
        language: body.language,
        internalCategory: body.internalCategory,
        metaCategory: body.metaCategory,
        components: body.components,
      });
      return reply.send({ template });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });

  app.delete("/:id", async (req, reply) => {
    try {
      await requireTemplatesEnabled();
      const params = req.params as { id: string };
      await WhatsAppTemplateService.deleteTemplate(params.id);
      return reply.send({ ok: true });
    } catch (err: any) {
      req.log.error(err);
      return reply.status(500).send({ error: err.message });
    }
  });
};
