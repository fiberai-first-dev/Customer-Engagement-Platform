/**
 * Instagram Business Login OAuth — authorize via public HTTPS redirect,
 * then paste the `code` from the callback URL (or use the HTML page on the API).
 *
 * Usage:
 *   npm run instagram:oauth
 *   npm run instagram:oauth -- --code=PASTE_CODE
 *
 * Meta → Omnichannel CRM-IG → Business login settings → OAuth redirect URIs must include EXACTLY:
 *   https://cep-api.logback-backend-services.online/oauth/instagram/callback
 */
import "../config/load-env.js";
import { env } from "../config/env.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const REDIRECT_URI =
  process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim() ||
  `${env.publicBaseUrl.replace(/\/$/, "")}/oauth/instagram/callback`;

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: env.instagram.appId,
    client_secret: env.instagram.appSecret,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
    code: code.replace(/#_$/, ""), // Instagram sometimes appends #_
  });

  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const shortJson = (await shortRes.json()) as {
    access_token?: string;
    user_id?: number | string;
    error_message?: string;
    error_type?: string;
  };
  if (!shortRes.ok || !shortJson.access_token) {
    throw new Error(
      shortJson.error_message ||
        shortJson.error_type ||
        `short-lived token exchange failed (${shortRes.status}): ${JSON.stringify(shortJson)}`,
    );
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env.instagram.appSecret);
  longUrl.searchParams.set("access_token", shortJson.access_token);

  const longRes = await fetch(longUrl);
  const longJson = (await longRes.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!longRes.ok || !longJson.access_token) {
    throw new Error(
      longJson.error?.message ||
        `long-lived exchange failed (${longRes.status}): ${JSON.stringify(longJson)}`,
    );
  }

  const meRes = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=id,username,user_id,account_type&access_token=${longJson.access_token}`,
  );
  const me = (await meRes.json()) as { id?: string; username?: string; user_id?: string };

  return {
    accessToken: longJson.access_token,
    expiresIn: longJson.expires_in,
    username: me.username,
  };
}

async function main() {
  if (!env.instagram.appId || !env.instagram.appSecret) {
    throw new Error("Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env first");
  }
  if (!REDIRECT_URI.startsWith("https://")) {
    throw new Error(`Redirect must be HTTPS for Instagram Business Login: ${REDIRECT_URI}`);
  }

  let code = getArg("code");
  if (!code) {
    const authUrl = new URL("https://www.instagram.com/oauth/authorize");
    authUrl.searchParams.set("client_id", env.instagram.appId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("force_reauth", "true");

    console.log("\n1) Meta → Business login settings → OAuth redirect URIs must include EXACTLY:");
    console.log(`   ${REDIRECT_URI}`);
    console.log("   (remove Chatwoot URI if present; Save)");
    console.log("\n2) Tunnel + API must be running with /oauth/instagram/callback");
    console.log("\n3) Open this URL, approve as @devdocfiberai:\n");
    console.log(authUrl.toString());
    console.log("\n4) After redirect you will land on the API page with the token,");
    console.log("   OR paste the full callback URL / code below.\n");

    const rl = readline.createInterface({ input, output });
    const pasted = (await rl.question("Paste callback URL or code: ")).trim();
    rl.close();

    if (pasted.includes("code=")) {
      code = new URL(pasted).searchParams.get("code") ?? undefined;
    } else {
      code = pasted || undefined;
    }
  }

  if (!code) throw new Error("No code provided");

  const result = await exchangeCode(code);
  console.log("\nAdd to apps/platform-api/.env:\n");
  console.log(`INSTAGRAM_ACCESS_TOKEN="${result.accessToken}"`);
  if (result.username) console.log(`INSTAGRAM_USERNAME="${result.username}"`);
  console.log("\nThen: npm run seed && npm run ig:subscribe");
  console.log("       docker compose -f ../docker-compose.yml up -d --force-recreate platform-api");
  if (result.expiresIn) {
    console.log(`\n(Long-lived token ~${Math.round(result.expiresIn / 86400)} days)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
