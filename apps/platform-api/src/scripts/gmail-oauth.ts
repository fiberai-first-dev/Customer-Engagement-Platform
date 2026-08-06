/**
 * One-time Gmail OAuth helper — prints a refresh token for .env
 *
 * Usage:
 *   npm run gmail:oauth
 *   # browser consent; tokens print in the terminal
 *
 * Redirect URI used: http://localhost:4101/oauth/gmail/callback
 * Add that exact URI under Google Cloud Console → OAuth client → Authorized redirect URIs
 */
import "../config/load-env.js";
import { createServer } from "node:http";
import { google } from "googleapis";
import { env } from "../config/env.js";

const OAUTH_PORT = Number(process.env.GMAIL_OAUTH_PORT || 4101);
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/oauth/gmail/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  if (!env.gmail.clientId || !env.gmail.clientSecret) {
    throw new Error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env first");
  }

  const oauth2 = new google.auth.OAuth2(
    env.gmail.clientId,
    env.gmail.clientSecret,
    REDIRECT_URI,
  );

  const codeArg = getArg("code");
  if (codeArg) {
    const { tokens } = await oauth2.getToken(codeArg);
    printTokens(tokens.refresh_token, tokens.access_token);
    return;
  }

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1) Ensure this Redirect URI exists in Google Cloud OAuth client:");
  console.log(`   ${REDIRECT_URI}`);
  console.log("\n2) Open this URL, sign in as the Gmail inbox account, approve:");
  console.log(`\n${authUrl}\n`);
  console.log(`3) Waiting on ${REDIRECT_URI} …\n`);

  const tokens = await waitForCode(oauth2);
  printTokens(tokens.refresh_token, tokens.access_token);
}

function printTokens(refresh?: string | null, access?: string | null) {
  if (!refresh) {
    console.error(
      "No refresh_token returned. Revoke app access at https://myaccount.google.com/permissions and retry.",
    );
    process.exit(1);
  }
  console.log("\nAdd these to apps/platform-api/.env:\n");
  console.log(`GMAIL_REFRESH_TOKEN="${refresh}"`);
  if (access) console.log(`GMAIL_ACCESS_TOKEN="${access}"`);
  console.log("\nThen run:");
  console.log("  npm run seed");
  console.log('  # auth + POST /api/v1/gmail/watch { "inboxId": "<gmail inbox id from seed>" }');
}

function waitForCode(oauth2: InstanceType<typeof google.auth.OAuth2>) {
  return new Promise<{ refresh_token?: string | null; access_token?: string | null }>(
    (resolve, reject) => {
      const server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? "/", `http://localhost:${OAUTH_PORT}`);
          if (url.pathname !== "/oauth/gmail/callback") {
            res.writeHead(404);
            res.end("not found");
            return;
          }
          const err = url.searchParams.get("error");
          if (err) throw new Error(`OAuth error: ${err}`);
          const code = url.searchParams.get("code");
          if (!code) throw new Error("Missing code in callback");

          const { tokens } = await oauth2.getToken(code);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h2>Gmail connected</h2><p>You can close this tab and return to the terminal.</p></body></html>",
          );
          server.close();
          resolve(tokens);
        } catch (e) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(e instanceof Error ? e.message : "oauth failed");
          server.close();
          reject(e);
        }
      });

      server.listen(OAUTH_PORT, "127.0.0.1");
      server.on("error", reject);
    },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
