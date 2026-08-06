import "./load-env.js";

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

/** Encode bare @ in DB password (user:p@ss@host → user:p%40ss@host). */
export function encodePasswordAtSigns(url: string): string {
  const schemeIdx = url.indexOf("://");
  if (schemeIdx < 0) return url;
  const rest = url.slice(schemeIdx + 3);
  const slashIdx = rest.search(/[/?]/);
  const authority = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
  const after = slashIdx >= 0 ? rest.slice(slashIdx) : "";
  const at = authority.lastIndexOf("@");
  if (at < 0) return url;
  const userinfo = authority.slice(0, at);
  const host = authority.slice(at + 1);
  const colon = userinfo.indexOf(":");
  if (colon < 0) return url;
  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  if (!password.includes("@")) return url;
  return `${url.slice(0, schemeIdx + 3)}${user}:${password.replace(/@/g, "%40")}@${host}${after}`;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return stripQuotes(value);
}

const rawDatabaseUrl = required(
  "PLATFORM_DATABASE_URL",
  "postgresql://cep:cep@localhost:5434/cep_platform",
);

export const env = {
  port: Number(process.env.PLATFORM_PORT ?? process.env.PORT ?? 4100),
  databaseUrl: encodePasswordAtSigns(rawDatabaseUrl),
  /** Prefer session/direct URL for migrations when pooler hangs */
  migrateDatabaseUrl: encodePasswordAtSigns(
    stripQuotes(
      process.env.PLATFORM_MIGRATE_DATABASE_URL ||
        process.env.PLATFORM_DATABASE_URL ||
        rawDatabaseUrl,
    ),
  ),
  adminUsername: stripQuotes(process.env.ADMIN_USERNAME ?? "admin"),
  adminPassword: stripQuotes(process.env.ADMIN_PASSWORD ?? "password"),
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET ?? "dev-jwt-secret-do-not-use-in-prod"),
  publicBaseUrl: stripQuotes(
    process.env.PLATFORM_PUBLIC_BASE_URL ??
      `http://localhost:${process.env.PLATFORM_PORT ?? 4100}`,
  ),

  gmail: {
    clientId: stripQuotes(process.env.GMAIL_CLIENT_ID ?? ""),
    clientSecret: stripQuotes(process.env.GMAIL_CLIENT_SECRET ?? ""),
    refreshToken: stripQuotes(process.env.GMAIL_REFRESH_TOKEN ?? ""),
    accessToken: stripQuotes(process.env.GMAIL_ACCESS_TOKEN ?? ""),
    pubsubTopic: stripQuotes(process.env.GMAIL_PUBSUB_TOPIC ?? ""),
  },
  whatsapp: {
    phoneNumberId: stripQuotes(process.env.WHATSAPP_PHONE_NUMBER_ID ?? ""),
    accessToken: stripQuotes(process.env.WHATSAPP_ACCESS_TOKEN ?? ""),
    verifyToken: stripQuotes(process.env.WHATSAPP_VERIFY_TOKEN ?? ""),
    appSecret: stripQuotes(process.env.WHATSAPP_APP_SECRET ?? ""),
    businessAccountId: stripQuotes(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? ""),
  },
  instagram: {
    pageId: stripQuotes(process.env.INSTAGRAM_PAGE_ID ?? ""),
    accessToken: stripQuotes(process.env.INSTAGRAM_ACCESS_TOKEN ?? ""),
    verifyToken: stripQuotes(process.env.INSTAGRAM_VERIFY_TOKEN ?? ""),
    appSecret: stripQuotes(process.env.INSTAGRAM_APP_SECRET ?? ""),
    appId: stripQuotes(process.env.INSTAGRAM_APP_ID ?? ""),
    username: stripQuotes(process.env.INSTAGRAM_USERNAME ?? ""),
  },
};

process.env.PLATFORM_DATABASE_URL = env.databaseUrl;
process.env.DATABASE_URL = env.databaseUrl;
if (!process.env.PLATFORM_MIGRATE_DATABASE_URL) {
  process.env.PLATFORM_MIGRATE_DATABASE_URL = env.migrateDatabaseUrl;
}
