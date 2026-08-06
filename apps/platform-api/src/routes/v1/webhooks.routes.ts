import type { FastifyInstance } from "fastify";
import { WebhookController } from "../../controllers/WebhookController.js";

export async function webhookRoutes(app: FastifyInstance) {
  // Stable Email Pub/Sub endpoint (Gmail under the hood; auto-resolves email inbox)
  app.post("/email/pubsub", WebhookController.handlePubSub);

  // Preferred: inbox-scoped webhooks
  app.get("/:channel/:inboxId", WebhookController.verifyWebhook);
  app.post("/:channel/:inboxId", WebhookController.receiveWebhook);

  // Convenience (single-tenant): channel-only routes
  app.get("/:channel", WebhookController.unifiedVerifyWebhook);
  app.post("/:channel", WebhookController.unifiedReceiveWebhook);
}
