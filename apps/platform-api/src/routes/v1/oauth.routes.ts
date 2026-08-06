import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";

const PUBLIC_CALLBACK =
  `${env.publicBaseUrl.replace(/\/$/, "")}/oauth/instagram/callback`;

/**
 * Public Meta Business Login endpoints (no auth).
 * Prefer `npm run instagram:oauth` (localhost) for token capture;
 * these routes support Meta-required HTTPS redirect / policy URLs.
 */
export async function instagramOAuthRoutes(app: FastifyInstance) {
  app.get("/instagram/callback", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    if (q.error) {
      return reply.code(400).type("text/html").send(
        `<html><body><h2>Instagram OAuth error</h2><pre>${q.error}: ${q.error_description ?? ""}</pre></body></html>`,
      );
    }
    const code = q.code;
    if (!code) {
      return reply.code(400).send({ error: "missing code" });
    }

    try {
      const shortBody = new URLSearchParams({
        client_id: env.instagram.appId,
        client_secret: env.instagram.appSecret,
        grant_type: "authorization_code",
        redirect_uri: PUBLIC_CALLBACK,
        code,
      });
      const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: shortBody,
      });
      const shortJson = (await shortRes.json()) as {
        access_token?: string;
        error_message?: string;
      };
      if (!shortJson.access_token) {
        throw new Error(shortJson.error_message || "short-lived exchange failed");
      }

      const longUrl = new URL("https://graph.instagram.com/access_token");
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", env.instagram.appSecret);
      longUrl.searchParams.set("access_token", shortJson.access_token);
      const longRes = await fetch(longUrl);
      const longJson = (await longRes.json()) as {
        access_token?: string;
        error?: { message?: string };
      };
      if (!longJson.access_token) {
        throw new Error(longJson.error?.message || "long-lived exchange failed");
      }

      return reply.type("text/html").send(`<!doctype html>
<html><body style="font-family:system-ui;padding:2rem;max-width:720px">
  <h2>Instagram connected</h2>
  <p>Copy into <code>apps/platform-api/.env</code>:</p>
  <pre style="background:#111;color:#eee;padding:1rem;overflow:auto">INSTAGRAM_ACCESS_TOKEN="${longJson.access_token}"</pre>
  <p>Then run <code>npm run seed</code>, <code>npm run ig:subscribe</code>, and recreate the API container.</p>
</body></html>`);
    } catch (err: any) {
      request.log.error(err, "instagram oauth callback failed");
      return reply.code(500).type("text/html").send(
        `<html><body><h2>OAuth failed</h2><pre>${err?.message ?? err}</pre></body></html>`,
      );
    }
  });

  /** Meta deauthorize callback */
  app.post("/instagram/deauthorize", async (request, reply) => {
    request.log.info({ body: request.body }, "instagram deauthorize");
    return reply.code(200).send({ ok: true });
  });

  /** Meta data deletion request callback */
  app.all("/instagram/data-deletion", async (request, reply) => {
    const confirmationCode = `cep_${Date.now()}`;
    request.log.info({ body: request.body, query: request.query }, "instagram data deletion");
    return reply.code(200).send({
      url: `${env.publicBaseUrl.replace(/\/$/, "")}/privacy`,
      confirmation_code: confirmationCode,
    });
  });
}
