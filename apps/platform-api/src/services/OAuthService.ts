import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { mergeChannelConfig } from "./MessagingService.js";
import type { Prisma } from "../generated/client/index.js";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

type OAuthProvider = "gmail" | "instagram";

type OAuthState = {
  purpose: "oauth";
  provider: OAuthProvider;
  inboxId: string;
};

function asConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v === "***") return null;
  return v;
}

export function gmailRedirectUri(): string {
  return `${env.publicBaseUrl.replace(/\/$/, "")}/oauth/gmail/callback`;
}

export function instagramRedirectUri(): string {
  return (
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim() ||
    `${env.publicBaseUrl.replace(/\/$/, "")}/oauth/instagram/callback`
  );
}

export function settingsReturnUrl(params: Record<string, string>): string {
  const base = env.webBaseUrl.replace(/\/$/, "");
  const q = new URLSearchParams(params);
  return `${base}/settings?${q.toString()}`;
}

function signState(payload: OAuthState): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "20m" });
}

function verifyState(token: string, provider: OAuthProvider): OAuthState {
  const decoded = jwt.verify(token, env.jwtSecret) as OAuthState;
  if (decoded.purpose !== "oauth" || decoded.provider !== provider || !decoded.inboxId) {
    throw new Error("invalid oauth state");
  }
  return decoded;
}

async function loadInbox(inboxId: string, channelType: "email" | "instagram") {
  const inbox = await prisma.inbox.findUnique({ where: { id: inboxId } });
  if (!inbox) throw new Error("inbox not found");
  if (inbox.channelType !== channelType) {
    throw new Error(`inbox is ${inbox.channelType}, expected ${channelType}`);
  }
  return inbox;
}

async function patchInboxConfig(
  inboxId: string,
  existing: Prisma.JsonValue,
  patch: Record<string, unknown>,
  enabled = true,
) {
  const channelConfig = mergeChannelConfig(existing, patch);
  return prisma.inbox.update({
    where: { id: inboxId },
    data: { channelConfig, enabled },
  });
}

export function oauthRedirectHints() {
  return {
    gmailRedirectUri: gmailRedirectUri(),
    instagramRedirectUri: instagramRedirectUri(),
    webBaseUrl: env.webBaseUrl,
    publicBaseUrl: env.publicBaseUrl,
    webhooks: {
      whatsapp: `${env.publicBaseUrl.replace(/\/$/, "")}/webhooks/whatsapp`,
      instagram: `${env.publicBaseUrl.replace(/\/$/, "")}/webhooks/instagram`,
      emailPubSub: `${env.publicBaseUrl.replace(/\/$/, "")}/webhooks/email/pubsub`,
    },
  };
}

/** Build Google consent URL using inbox (or env) OAuth client credentials. */
export async function startGmailOAuth(inboxId: string): Promise<{ url: string; redirectUri: string }> {
  const inbox = await loadInbox(inboxId, "email");
  const cfg = asConfig(inbox.channelConfig);
  const clientId = nonEmpty(cfg.clientId) ?? env.gmail.clientId;
  const clientSecret = nonEmpty(cfg.clientSecret) ?? env.gmail.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Save Gmail Client ID and Client Secret in Settings first, then click Connect Gmail.",
    );
  }

  const redirectUri = gmailRedirectUri();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const state = signState({ purpose: "oauth", provider: "gmail", inboxId });
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });
  return { url, redirectUri };
}

export async function completeGmailOAuth(input: {
  code: string;
  state: string;
}): Promise<{ returnUrl: string; email?: string }> {
  const { inboxId } = verifyState(input.state, "gmail");
  const inbox = await loadInbox(inboxId, "email");
  const cfg = asConfig(inbox.channelConfig);
  const clientId = nonEmpty(cfg.clientId) ?? env.gmail.clientId;
  const clientSecret = nonEmpty(cfg.clientSecret) ?? env.gmail.clientSecret;
  if (!clientId || !clientSecret) {
    throw new Error("Gmail Client ID / Secret missing on inbox");
  }

  const redirectUri = gmailRedirectUri();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const { tokens } = await oauth2.getToken(input.code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke app access at https://myaccount.google.com/permissions and connect again.",
    );
  }

  oauth2.setCredentials(tokens);
  let mailbox: string | undefined;
  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const profile = await gmail.users.getProfile({ userId: "me" });
    mailbox = profile.data.emailAddress ?? undefined;
  } catch {
    /* optional */
  }

  await patchInboxConfig(inbox.id, inbox.channelConfig, {
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
    ...(mailbox ? { email: mailbox } : {}),
  });

  return {
    email: mailbox,
    returnUrl: settingsReturnUrl({
      oauth: "gmail",
      status: "success",
      ...(mailbox ? { email: mailbox } : {}),
    }),
  };
}

export async function startInstagramOAuth(
  inboxId: string,
): Promise<{ url: string; redirectUri: string }> {
  const inbox = await loadInbox(inboxId, "instagram");
  const cfg = asConfig(inbox.channelConfig);
  const appId = nonEmpty(cfg.instagramAppId) ?? env.instagram.appId;
  const appSecret = nonEmpty(cfg.appSecret) ?? env.instagram.appSecret;
  if (!appId || !appSecret) {
    throw new Error(
      "Save Instagram App ID and App Secret in Settings first, then click Connect Instagram.",
    );
  }

  const redirectUri = instagramRedirectUri();
  if (!redirectUri.startsWith("https://")) {
    throw new Error(`Instagram redirect must be HTTPS: ${redirectUri}`);
  }

  const state = signState({ purpose: "oauth", provider: "instagram", inboxId });
  const authUrl = new URL("https://www.instagram.com/oauth/authorize");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", IG_SCOPES);
  authUrl.searchParams.set("force_reauth", "true");
  authUrl.searchParams.set("state", state);

  return { url: authUrl.toString(), redirectUri };
}

export async function subscribeInstagramMessaging(
  accessToken: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const fields = [
    "messages",
    "messaging_postbacks",
    "messaging_seen",
    "message_reactions",
    "messaging_referral",
  ].join(",");
  try {
    const res = await fetch(
      `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body.error?.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "subscribe failed",
    };
  }
}

async function subscribeInstagramMessages(accessToken: string) {
  await subscribeInstagramMessaging(accessToken);
}

export async function completeInstagramOAuth(input: {
  code: string;
  state?: string;
}): Promise<{ returnUrl: string; username?: string; accessToken: string }> {
  let inboxId: string | undefined;
  if (input.state) {
    inboxId = verifyState(input.state, "instagram").inboxId;
  }

  const inbox = inboxId
    ? await loadInbox(inboxId, "instagram")
    : await prisma.inbox.findFirst({
        where: { channelType: "instagram" },
        orderBy: { createdAt: "asc" },
      });
  if (!inbox) throw new Error("No Instagram inbox found to save token");

  const cfg = asConfig(inbox.channelConfig);
  const appId = nonEmpty(cfg.instagramAppId) ?? env.instagram.appId;
  const appSecret = nonEmpty(cfg.appSecret) ?? env.instagram.appSecret;
  if (!appId || !appSecret) {
    throw new Error("Instagram App ID / Secret missing on inbox");
  }

  const redirectUri = instagramRedirectUri();
  const code = input.code.replace(/#_$/, "");

  const shortBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
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
    throw new Error(shortJson.error_message || "short-lived token exchange failed");
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortJson.access_token);
  const longRes = await fetch(longUrl);
  const longJson = (await longRes.json()) as {
    access_token?: string;
    error?: { message?: string };
  };
  if (!longJson.access_token) {
    throw new Error(longJson.error?.message || "long-lived exchange failed");
  }

  let username: string | undefined;
  let pageId: string | undefined;
  try {
    const meRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,user_id,account_type&access_token=${longJson.access_token}`,
    );
    const me = (await meRes.json()) as {
      id?: string;
      username?: string;
      user_id?: string;
    };
    username = me.username;
    pageId = me.user_id ?? me.id;
  } catch {
    /* optional */
  }

  await subscribeInstagramMessages(longJson.access_token);

  await patchInboxConfig(inbox.id, inbox.channelConfig, {
    accessToken: longJson.access_token,
    instagramAppId: appId,
    appSecret,
    ...(username ? { instagramUsername: username } : {}),
    ...(pageId ? { pageId } : {}),
  });

  return {
    accessToken: longJson.access_token,
    username,
    returnUrl: settingsReturnUrl({
      oauth: "instagram",
      status: "success",
      ...(username ? { username } : {}),
    }),
  };
}
