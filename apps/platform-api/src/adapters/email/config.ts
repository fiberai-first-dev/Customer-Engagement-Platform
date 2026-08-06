import { env } from "../../config/env.js";
import type { EmailChannelConfig } from "../shared/types.js";

export const emailConfig: EmailChannelConfig = {
  clientId: env.gmail.clientId,
  clientSecret: env.gmail.clientSecret,
  refreshToken: env.gmail.refreshToken,
  accessToken: env.gmail.accessToken,
  pubsubTopic: env.gmail.pubsubTopic,
};
