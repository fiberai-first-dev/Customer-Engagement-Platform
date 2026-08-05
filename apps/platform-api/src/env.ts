import "./load-env.js";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PLATFORM_PORT ?? process.env.PORT ?? 4100),
  databaseUrl: required(
    "PLATFORM_DATABASE_URL",
    "postgresql://cep:cep@localhost:5434/cep_platform",
  ),
  adminToken: required(
    "PLATFORM_ADMIN_TOKEN",
    process.env.CEP_ADMIN_TOKEN ?? "dev-token-change-me",
  ),
  publicBaseUrl:
    process.env.PLATFORM_PUBLIC_BASE_URL ??
    `http://localhost:${process.env.PLATFORM_PORT ?? 4100}`,
};

if (!process.env.PLATFORM_DATABASE_URL) {
  process.env.PLATFORM_DATABASE_URL = env.databaseUrl;
}
