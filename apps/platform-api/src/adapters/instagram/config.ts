import { env } from "../../config/env.js";
import type { InstagramChannelConfig } from "../shared/types.js";

export const instagramConfig: InstagramChannelConfig = {
  pageId: env.instagram.pageId,
  accessToken: env.instagram.accessToken,
  verifyToken: env.instagram.verifyToken,
  appSecret: env.instagram.appSecret,
  instagramAppId: env.instagram.appId,
  instagramUsername: env.instagram.username,
};
