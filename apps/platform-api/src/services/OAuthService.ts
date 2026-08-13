import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { prisma } from "../config/db.js";
import { mergeChannelConfig } from "./MessagingService.js";
import { setupEmailWatch } from "./EmailService.js";
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
  nonce: string;
};

type PendingGmail = {
  provider: "gmail";
  inboxId: string;
  clientId: string;
  clientSecret: string;
  pubsubTopic: string;
  expiresAt: number;
};

type PendingInstagram = {
  provider: "instagram";
  inboxId: string;
  instagramAppId: string;
  instagramAppSecret: string;
  verifyToken: string;
  expiresAt: number;
};

const PENDING_TTL_MS = 20 * 60 * 1000;
const pendingOAuth = new Map<string, PendingGmail | PendingInstagram>();

function putPending(entry: Omit<PendingGmail, "expiresAt"> | Omit<PendingInstagram, "expiresAt">): string {
  const nonce = randomUUID();
  pendingOAuth.set(nonce, { ...entry, expiresAt: Date.now() + PENDING_TTL_MS });
  return nonce;
}

function takePending(
  nonce: string,
  provider: OAuthProvider,
  inboxId: string,
): PendingGmail | PendingInstagram | null {
  const entry = pendingOAuth.get(nonce);
  pendingOAuth.delete(nonce);
  if (!entry || entry.provider !== provider || entry.inboxId !== inboxId) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v === "***") return null;
  return v;
}

export function gmailRedirectUri(): string {
  return `${env.apiBaseUrl.replace(/\/$/, "")}/oauth/gmail/callback`;
}

export function instagramRedirectUri(): string {
  return (
    process.env.INSTAGRAM_OAUTH_REDIRECT_URI?.trim() ||
    `${env.apiBaseUrl.replace(/\/$/, "")}/oauth/instagram/callback`
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
  if (
    decoded.purpose !== "oauth" ||
    decoded.provider !== provider ||
    !decoded.inboxId ||
    !decoded.nonce
  ) {
    throw new Error("invalid oauth state");
  }
  return decoded;
}

async function loadInbox(inboxId: string, channelType: "email" | "instagram") {
  const inbox = await prisma.channelConfig.findUnique({ where: { id: inboxId } });
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
  return prisma.channelConfig.update({
    where: { id: inboxId },
    data: { channelConfig, enabled },
  });
}

export function oauthRedirectHints() {
  const api = env.apiBaseUrl.replace(/\/$/, "");
  return {
    gmailRedirectUri: gmailRedirectUri(),
    instagramRedirectUri: instagramRedirectUri(),
    instagramDeauthorizeUri: `${api}/oauth/instagram/deauthorize`,
    instagramDataDeletionUri: `${api}/oauth/instagram/data-deletion`,
    privacyUrl: `${api}/privacy`,
    webBaseUrl: env.webBaseUrl,
    apiBaseUrl: env.apiBaseUrl,
    webhooks: {
      whatsapp: `${api}/webhooks/whatsapp`,
      instagram: `${api}/webhooks/instagram`,
      emailPubSub: `${api}/webhooks/email/pubsub`,
    },
  };
}

export async function startGmailOAuth(
  inboxId: string,
  creds: { clientId?: string; clientSecret?: string; pubsubTopic?: string },
): Promise<{ url: string; redirectUri: string }> {
  await loadInbox(inboxId, "email");
  const clientId = nonEmpty(creds.clientId);
  const clientSecret = nonEmpty(creds.clientSecret);
  const pubsubTopic = nonEmpty(creds.pubsubTopic);
  if (!clientId || !clientSecret || !pubsubTopic) {
    throw new Error("Enter Client ID, Client Secret, and Pub/Sub Topic, then click Connect.");
  }

  const nonce = putPending({
    provider: "gmail",
    inboxId,
    clientId,
    clientSecret,
    pubsubTopic,
  });
  const redirectUri = gmailRedirectUri();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const state = signState({ purpose: "oauth", provider: "gmail", inboxId, nonce });
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
  const { inboxId, nonce } = verifyState(input.state, "gmail");
  const pending = takePending(nonce, "gmail", inboxId);
  if (!pending || pending.provider !== "gmail") {
    throw new Error("Connection expired. Click Connect again.");
  }
  const inbox = await loadInbox(inboxId, "email");
  const clientId = pending.clientId;
  const clientSecret = pending.clientSecret;

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
    pubsubTopic: pending.pubsubTopic,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token ?? "",
    ...(mailbox ? { email: mailbox } : {}),
  });

  try {
    await setupEmailWatch(inbox.id);
  } catch (err) {
    console.warn(
      "[gmail] auto watch after Connect:",
      err instanceof Error ? err.message : err,
    );
  }

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
  creds: { instagramAppId?: string; instagramAppSecret?: string; verifyToken?: string },
): Promise<{ url: string; redirectUri: string }> {
  await loadInbox(inboxId, "instagram");
  const appId = nonEmpty(creds.instagramAppId);
  const appSecret = nonEmpty(creds.instagramAppSecret);
  const verifyToken = nonEmpty(creds.verifyToken);
  if (!appId || !appSecret || !verifyToken) {
    throw new Error("Enter Instagram App ID, App Secret, and Verify Token, then click Connect.");
  }

  const redirectUri = instagramRedirectUri();
  if (!redirectUri.startsWith("https://")) {
    throw new Error(`Instagram redirect must be HTTPS: ${redirectUri}`);
  }

  const nonce = putPending({
    provider: "instagram",
    inboxId,
    instagramAppId: appId,
    instagramAppSecret: appSecret,
    verifyToken,
  });
  const state = signState({ purpose: "oauth", provider: "instagram", inboxId, nonce });
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
  if (!input.state) {
    throw new Error("Connection expired. Click Connect again.");
  }
  const { inboxId, nonce } = verifyState(input.state, "instagram");
  const pending = takePending(nonce, "instagram", inboxId);
  if (!pending || pending.provider !== "instagram") {
    throw new Error("Connection expired. Click Connect again.");
  }

  const inbox = await loadInbox(inboxId, "instagram");
  const appId = pending.instagramAppId;
  const appSecret = pending.instagramAppSecret;

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
  } catch {
    /* optional */
  }

  await subscribeInstagramMessages(longJson.access_token);

  await patchInboxConfig(inbox.id, inbox.channelConfig, {
    accessToken: longJson.access_token,
    instagramAppId: appId,
    instagramAppSecret: appSecret,
    verifyToken: pending.verifyToken,
    ...(username ? { instagramUsername: username } : {}),
    appSecret: null,
    pageId: null,
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
