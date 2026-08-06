import { env } from "../../config/env.js";
import type { WhatsAppChannelConfig } from "../shared/types.js";

export const whatsappConfig: WhatsAppChannelConfig = {
  phoneNumberId: env.whatsapp.phoneNumberId,
  accessToken: env.whatsapp.accessToken,
  verifyToken: env.whatsapp.verifyToken,
  appSecret: env.whatsapp.appSecret,
  businessAccountId: env.whatsapp.businessAccountId,
};
