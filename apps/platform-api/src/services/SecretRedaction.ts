/** Keys that must never leave the API in plaintext (XSS / screenshare risk). */
export const CHANNEL_SECRET_KEYS = [
  "accessToken",
  "refreshToken",
  "clientSecret",
  "appSecret",
  "instagramAppSecret",
  "verifyToken",
] as const;

export const SECRET_PLACEHOLDER = "***";

export function isSecretPlaceholder(value: unknown): boolean {
  return typeof value === "string" && value.trim() === SECRET_PLACEHOLDER;
}

export function redactChannelConfigForClient(
  channelConfig: unknown,
): Record<string, unknown> {
  if (!channelConfig || typeof channelConfig !== "object" || Array.isArray(channelConfig)) {
    return {};
  }
  const out: Record<string, unknown> = { ...(channelConfig as Record<string, unknown>) };
  for (const key of CHANNEL_SECRET_KEYS) {
    const value = out[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = SECRET_PLACEHOLDER;
    }
  }
  return out;
}
