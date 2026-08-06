import type { FastifyInstance } from "fastify";
import {
  oauthRedirectHints,
  startGmailOAuth,
  startInstagramOAuth,
} from "../../services/OAuthService.js";

/**
 * Authenticated OAuth helpers for the Settings UI.
 * Browser never needs CLI — vendor clicks Connect → API returns Google/Meta URL.
 */
export async function oauthConnectRoutes(app: FastifyInstance) {
  app.get("/hints", async () => oauthRedirectHints());

  app.post<{
    Body: { inboxId?: string };
  }>("/gmail/start", async (request, reply) => {
    const inboxId = request.body?.inboxId;
    if (!inboxId) return reply.code(400).send({ error: "inboxId required" });
    try {
      const result = await startGmailOAuth(inboxId);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? "failed to start Gmail OAuth" });
    }
  });

  app.post<{
    Body: { inboxId?: string };
  }>("/instagram/start", async (request, reply) => {
    const inboxId = request.body?.inboxId;
    if (!inboxId) return reply.code(400).send({ error: "inboxId required" });
    try {
      const result = await startInstagramOAuth(inboxId);
      return reply.send(result);
    } catch (err: any) {
      return reply.code(400).send({ error: err?.message ?? "failed to start Instagram OAuth" });
    }
  });
}
