/**
 * Force-subscribe Instagram account to messaging webhook fields (Dev checklist).
 * Usage: npx tsx src/scripts/ig-subscribe-webhooks.ts
 */
import "../config/load-env.js";
import { env } from "../config/env.js";

const token = env.instagram.accessToken;
if (!token) {
  console.error("Missing INSTAGRAM_ACCESS_TOKEN");
  process.exit(1);
}

const fields = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "message_reactions",
  "messaging_referral",
].join(",");

const headers = { Authorization: `Bearer ${token}` };

const me = await fetch(
  "https://graph.instagram.com/v21.0/me?fields=id,username,user_id,account_type",
  { headers },
).then((r) => r.json());
console.log("me", me);

const before = await fetch("https://graph.instagram.com/v21.0/me/subscribed_apps", {
  headers,
}).then((r) => r.json());
console.log("before", JSON.stringify(before, null, 2));

const sub = await fetch(
  `https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}`,
  { method: "POST", headers },
).then(async (r) => ({ status: r.status, body: await r.json() }));
console.log("subscribe", sub);

const after = await fetch("https://graph.instagram.com/v21.0/me/subscribed_apps", {
  headers,
}).then((r) => r.json());
console.log("after", JSON.stringify(after, null, 2));

console.log(`
Next (Dev mode checklist — do these in Meta UI):
1) App Roles → Instagram Tester for SENDER account → accept invite on Instagram.com
2) Instagram API setup → webhook toggle ON for @${env.instagram.username || "business"}
3) Messenger product → Instagram Settings → same Callback URL + subscribe messages
   https://developers.facebook.com/apps/${env.instagram.appId}/messenger/instagram/
   (If 404, open parent Facebook app → Messenger → Instagram settings)
4) From tester, send a NEW text DM (not only open/read the chat)
5) docker logs -f apps-platform-api-1  → expect POST /webhooks/instagram with message text

Known Meta limitation (community + your symptoms):
In Instagram Login Development mode, messaging_seen / reactions may deliver while
messages field is silently dropped. If that persists after Messenger product subscribe,
Dev mode cannot deliver text DMs — Live (or Page/Messenger path) is required.
`);
