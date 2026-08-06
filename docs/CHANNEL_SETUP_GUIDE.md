# Channel Setup Guide (Development)

Vendor / engineer guide to configure **WhatsApp**, **Instagram**, and **Gmail** for the Customer Engagement Platform (CEP) **in Development mode only**.

This document covers:

- How send & receive work (high level)
- Required credentials and where to get them
- Exact console links and configuration steps
- Public URL (ngrok) requirements
- Platform `.env` + seed + Docker
- Test users / testers required so webhooks fire in Development
- Verification checklist

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Prerequisites (all channels)](#2-prerequisites-all-channels)
3. [Platform bootstrap](#3-platform-bootstrap)
4. [WhatsApp Cloud API](#4-whatsapp-cloud-api)
5. [Instagram Messaging](#5-instagram-messaging)
6. [Gmail API](#6-gmail-api)
7. [Agent Inbox UI behaviour](#7-agent-inbox-ui-behaviour)
8. [Troubleshooting](#8-troubleshooting)
9. [Credential quick reference](#9-credential-quick-reference)

---

## 1. Architecture overview

CEP uses a Chatwoot-style model:

```text
Account → Inbox (per channel) → Conversation → Message
                ↓
         Contact + ContactIdentity
```

| Direction | Flow |
|-----------|------|
| **Inbound (receive)** | Vendor platform → public HTTPS webhook → `platform-api` → normalize → Contact / Conversation / Message → Agent UI (polls API) |
| **Outbound (send)** | Agent UI → `POST /api/v1/conversations/:id/messages` → channel adapter → WhatsApp / Instagram / Gmail API → customer |

Important rules:

- Replies always go out on the **same channel / inbox** as the conversation.
- Meta (WhatsApp / Instagram) and Gmail cannot call `localhost`. You need a **public HTTPS** base URL (`PLATFORM_PUBLIC_BASE_URL`).
- In **Development** mode on Meta/Google, only **approved testers** can typically trigger real inbound traffic. Production/Live is out of scope for this guide.

Webhook routes (API):

| Channel | Preferred callback |
|---------|--------------------|
| WhatsApp | `{PUBLIC}/webhooks/whatsapp` |
| Instagram | `{PUBLIC}/webhooks/instagram` |
| Gmail (Pub/Sub push) | `{PUBLIC}/webhooks/email/pubsub` |

Inbox-scoped variants also work: `{PUBLIC}/webhooks/{channel}/{inboxId}`.

After seed, the CLI prints the exact URLs for your account.

---

## 2. Prerequisites (all channels)

### 2.1 Local software

- Node.js 20+
- Docker Desktop (optional but recommended for API)
- A Git checkout of this repo
- PostgreSQL (local or hosted, e.g. Supabase)

### 2.2 Public HTTPS tunnel (required for webhooks)

Meta and Google Pub/Sub must reach your API.

1. Install [ngrok](https://ngrok.com/download) (or Cloudflare Tunnel).
2. Start the API on port `4100`.
3. Expose it:

```bash
ngrok http 4100
```

4. Copy the HTTPS URL, e.g. `https://abc123.ngrok-free.dev` (**no trailing slash**).
5. Set in `apps/platform-api/.env`:

```env
PLATFORM_PUBLIC_BASE_URL="https://abc123.ngrok-free.dev"
```

6. Keep both the API and ngrok running while testing inbound.

Notes:

- Free ngrok URLs change when you restart ngrok — update `.env`, re-run `npm run seed`, and update Meta / Pub/Sub callbacks.
- Free ngrok may show a browser interstitial; API clients (Meta/Google) usually still POST successfully. If push fails, use a reserved/paid domain.

### 2.3 Meta Developer account (WhatsApp + Instagram)

- Create / log in: [https://developers.facebook.com/](https://developers.facebook.com/)
- You need a **Meta App** (type Business is typical).
- Prefer **one Meta App** that owns both WhatsApp and Instagram products you will use. Do not mix app IDs / tokens across different apps unless you know what you are doing.

Useful entry points:

- Your apps: [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
- App dashboard (replace `{APP_ID}`):  
  `https://developers.facebook.com/apps/{APP_ID}/dashboard/`
- App roles (testers):  
  `https://developers.facebook.com/apps/{APP_ID}/roles/roles/`
- Webhooks:  
  `https://developers.facebook.com/apps/{APP_ID}/webhooks/`

### 2.4 Google Cloud project (Gmail)

- Console: [https://console.cloud.google.com/](https://console.cloud.google.com/)
- Enable **Gmail API** and **Cloud Pub/Sub API**
- OAuth consent screen in **Testing**
- OAuth 2.0 Client ID (Web application)

---

## 3. Platform bootstrap

Work from `apps/platform-api` unless noted.

### 3.1 Configure base `.env`

Copy example:

```bash
cp .env.example .env
```

Minimum platform keys:

```env
PLATFORM_PORT=4100
PLATFORM_DATABASE_URL="postgresql://..."
# Prefer session/direct :5432 if migrate hangs on pooler :6543
PLATFORM_MIGRATE_DATABASE_URL="postgresql://..."
PLATFORM_PUBLIC_BASE_URL="https://YOUR-NGROK-HOST"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="password"
JWT_SECRET="change-me"
```

Encode `@` in DB passwords as `%40`.

### 3.2 Install, migrate, seed

```bash
npm install
npm run bootstrap
# equivalent: npm run db:deploy && npm run seed
```

Seed creates (or updates) one Account and channel Inboxes from env credentials. It prints webhook URLs.

Whenever you change channel tokens or `PLATFORM_PUBLIC_BASE_URL`, run:

```bash
npm run seed
```

### 3.3 Start API + web

Docker (from `apps/`):

```bash
docker compose up -d --build
```

- API: [http://localhost:4100/health](http://localhost:4100/health)
- Web UI: [http://localhost:9000](http://localhost:9000) (mapped from Vite)

Or run API locally:

```bash
npm run dev
```

Login with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Follow webhook traffic:

```bash
docker logs -f apps-platform-api-1
```

You should see lines like `POST /webhooks/whatsapp` or `msg":"webhook"`.

---

## 4. WhatsApp Cloud API

### 4.1 High-level send / receive

**Receive**

1. Customer messages your WhatsApp Business number.
2. Meta POSTs to `{PUBLIC}/webhooks/whatsapp`.
3. API verifies / ingests → creates ContactIdentity (`whatsapp` + WA id) → Conversation on WhatsApp Inbox → Message.
4. Agent UI lists the conversation (status Active = `open` / `pending`).

**Send**

1. Agent replies in Inbox on the WhatsApp tab.
2. API resolves recipient from ContactIdentity / phone / thread id.
3. WhatsApp adapter calls Graph API:  
   `POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages`
4. Message stored as `sent` or `failed` (failed if token expired / recipient invalid / etc.).

### 4.2 Credentials required

| Env var | Purpose |
|---------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | Graph path id for the Business phone number |
| `WHATSAPP_ACCESS_TOKEN` | Bearer token to send messages (and many Graph reads) |
| `WHATSAPP_VERIFY_TOKEN` | Shared secret you invent; Meta sends it on webhook GET verify |
| `WHATSAPP_APP_SECRET` | App secret (signature verification / future hardening) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA id (optional for basic send, useful for admin) |

### 4.3 How to get credentials (with links)

1. Open [Meta Apps](https://developers.facebook.com/apps/) → select your app (or **Create App** → Business).
2. Add product **WhatsApp** if missing:  
   `https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-settings/`  
   or from dashboard **Add Product → WhatsApp**.
3. Open **WhatsApp → API Setup**:  
   `https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-dev-console/`
4. Copy:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** → `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - Temporary (or System User) **Access token** → `WHATSAPP_ACCESS_TOKEN`
5. App secret: **App settings → Basic**:  
   `https://developers.facebook.com/apps/{APP_ID}/settings/basic/`  
   → **App Secret** → `WHATSAPP_APP_SECRET`
6. Choose your own verify string (example: `cep-wa-verify-dev`) → `WHATSAPP_VERIFY_TOKEN`

**Token tip (Development):** Temporary tokens expire (~24h). Expired token = **outbound fails** (OAuth 190) while inbound webhooks may still work. Prefer a **System User** permanent token for longer testing: Business Settings → System Users → Generate token with `whatsapp_business_messaging` / `whatsapp_business_management`.

Docs:

- [WhatsApp Cloud API getting started](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started)

### 4.4 Configure webhook in Meta

1. Open Webhooks for the app:  
   `https://developers.facebook.com/apps/{APP_ID}/webhooks/`
2. Subscribe to object **WhatsApp Business Account** (or follow WhatsApp product webhook UI).
3. Callback URL:

```text
https://YOUR-NGROK-HOST/webhooks/whatsapp
```

4. Verify token = exact value of `WHATSAPP_VERIFY_TOKEN`.
5. Subscribe to field **`messages`**.
6. Ensure the WABA / phone number is linked to this app and webhook subscription is active (WhatsApp → Configuration may also show webhook fields).

### 4.5 Development test users / numbers

WhatsApp Cloud API Development uses a **test business number** and a short list of **allowed recipient numbers**.

1. In **WhatsApp → API Setup**, under **To**, manage the list of phone numbers that can message / receive from the test number.
2. Add your personal WhatsApp number → complete Meta’s verification SMS/call.
3. From that verified personal number, send a WhatsApp message **to the test business number** shown in API Setup.
4. In Docker logs you should see `POST /webhooks/whatsapp`.
5. Open Agent Inbox → conversation appears → reply → customer receives WhatsApp reply (token must be valid).

**You do not add “Instagram Tester” for WhatsApp.** For WA, the “tester” is the **phone number allow-list** in API Setup (Development). Admins of the Meta app can typically interact with the test number as documented by Meta.

### 4.6 Platform steps after Meta is ready

```env
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_VERIFY_TOKEN="your-shared-secret"
WHATSAPP_APP_SECRET="..."
WHATSAPP_BUSINESS_ACCOUNT_ID="..."
PLATFORM_PUBLIC_BASE_URL="https://YOUR-NGROK-HOST"
```

```bash
cd apps/platform-api
npm run seed
# restart API / docker compose up -d --build platform-api if needed
```

Quick verify:

```bash
curl "http://localhost:4100/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=ok"
# expect: ok
```

---

## 5. Instagram Messaging

This platform is wired primarily for **Instagram API with Instagram Login** tokens (`IGAA…`), using:

- Receive: Meta webhook → `{PUBLIC}/webhooks/instagram`
- Send: `POST https://graph.instagram.com/v21.0/me/messages`

Page tokens (`EAA…` via Facebook Page) are also supported by the adapter (`/{pageId}/messages`) if configured that way.

### 5.1 High-level send / receive

**Receive**

1. A permitted Instagram user DMs your Business/Creator Instagram (`INSTAGRAM_USERNAME`).
2. Meta POSTs webhook payload (`object: "instagram"` or dashboard sample shape).
3. API ingests → ContactIdentity channel `instagram` → Conversation on Instagram Inbox → Message.

**Send**

1. Agent replies on Instagram tab.
2. Adapter sends to recipient IGSID using Instagram Graph.
3. Status `sent` / `failed` stored on the message.

Outbound only works after an inbound conversation exists (you need the recipient IG-scoped id from a DM).

### 5.2 Credentials required

| Env var | Purpose |
|---------|---------|
| `INSTAGRAM_ACCESS_TOKEN` | Instagram User token (`IGAA…`) or Page token |
| `INSTAGRAM_VERIFY_TOKEN` | Shared secret for webhook GET verify |
| `INSTAGRAM_APP_SECRET` | Meta App Secret |
| `INSTAGRAM_APP_ID` | Meta App ID hosting Instagram product |
| `INSTAGRAM_PAGE_ID` | Facebook Page id (needed for Page-token send path) |
| `INSTAGRAM_USERNAME` | Human-readable handle (seed / display) |

### 5.3 How to get credentials (with links)

1. Meta Apps: [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
2. Use the **same app** that will own Instagram webhooks. Note App ID:  
   `https://developers.facebook.com/apps/{APP_ID}/settings/basic/`  
   → App ID → `INSTAGRAM_APP_ID`  
   → App Secret → `INSTAGRAM_APP_SECRET`
3. Add **Instagram** product (Instagram API / Instagram Login as applicable):  
   Dashboard → Add Product, or:  
   `https://developers.facebook.com/apps/{APP_ID}/instagram-business/API-Setup/`
4. Complete Instagram Business Login / business account linking for the Instagram account that should receive DMs (e.g. `@yourbrand`).
5. Generate a long-lived **Instagram User access token** with messaging permissions as shown in API Setup / Graph Explorer for Instagram Login.  
   Token should look like `IGAA…` for the Instagram Login path.
6. If using Page-linked messaging instead, obtain Page ID + Page access token from:  
   [https://developers.facebook.com/tools/explorer/](https://developers.facebook.com/tools/explorer/)  
   and Page settings.
7. Set `INSTAGRAM_VERIFY_TOKEN` to a string you invent (example: `cep-ig-verify-dev`).
8. Set `INSTAGRAM_USERNAME` to the connected handle.

Docs:

- [Instagram Messaging](https://developers.facebook.com/docs/messenger-platform/instagram)
- [Instagram webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)

### 5.4 Configure webhook in Meta

1. Webhooks: `https://developers.facebook.com/apps/{APP_ID}/webhooks/`  
   and/or Instagram API Setup:  
   `https://developers.facebook.com/apps/{APP_ID}/instagram-business/API-Setup/`
2. Callback URL:

```text
https://YOUR-NGROK-HOST/webhooks/instagram
```

3. Verify token = `INSTAGRAM_VERIFY_TOKEN`.
4. Subscribe field: **`messages`**.
5. Confirm verify succeeds (Meta should show green / verified). Platform returns hub challenge when token matches.

### 5.5 Subscribe the Instagram account to the app (required)

Even with webhook configured, the IG account must be subscribed to `messages`:

```http
POST https://graph.instagram.com/v21.0/me/subscribed_apps?subscribed_fields=messages
Authorization: Bearer {INSTAGRAM_ACCESS_TOKEN}
```

Or after seed, use a small script / Graph API call with your token. Successful response includes `subscribed_fields: ["messages"]`.

### 5.6 Development test users — **required for real DMs**

In **Development** mode, DMs from a random Instagram user **do not** deliver webhooks.

You must add the sender as an **Instagram Tester** (or Admin/Developer where applicable) on the **same Meta App** that owns the token/webhook.

#### Steps to add Instagram Tester

1. Open App Roles:  
   `https://developers.facebook.com/apps/{APP_ID}/roles/roles/`
2. Click **Add people**.
3. Select role **Instagram Tester**  
   (*“Can test all permissions, features, and products, required by the Instagram product.”*)
4. Enter the tester’s **Instagram username** (no `@`), e.g. `jagadeshwarreddy_`.
5. Click **Add**.  
   If you get *“Form can't be saved”*:
   - Username must be exact
   - Tester’s IG account often needs to be **Professional** (Creator/Business)
   - Prefer selecting the user from Meta’s search dropdown
   - Do not select conflicting extra roles unless needed
6. The tester must **accept** the invite in Instagram (Settings / professional dashboard invites / notifications). Pending invite = no webhooks.
7. Tester opens Instagram → DMs **`@{INSTAGRAM_USERNAME}`** with a text message.
8. Docker logs must show `POST /webhooks/instagram` and `webhook ingested`.
9. Refresh Agent Inbox (filter **Active** or **All**).

**Optional:** Meta dashboard **Send to My Server** on the `messages` field is useful to prove callback reachability. Sample payloads may omit the production `entry[]` wrapper; the platform accepts both shapes.

### 5.6.1 Research notes — Development mode for Instagram Login (important)

This matches what vendors hit in practice (including this project’s logs: **read receipts arrive, text DMs do not**).

**Official / UI statements**

- Instagram Platform webhook docs and the **Instagram Business Login → Configure webhooks** UI often state: app should be **Live** to receive webhooks.
- Meta developer community has many threads where, in **Development + Instagram Login**:
  - `messaging_seen` (reads) and `message_reactions` **do** deliver
  - `messages` (text DMs) are **silently dropped** (no HTTP hit on your server)
  - Dashboard “Send to My Server” can succeed while real DMs still fail

So **Dev mode is only partly supported** for this product path. Testers alone are not always enough for the `messages` field.

**Dev-mode setup to try anyway (best-effort checklist)**

1. Confirm which **Facebook App ID** owns the token (not only the Instagram App ID on the Business Login screen):

```bash
cd apps/platform-api
npx tsx src/scripts/ig-subscribe-webhooks.ts
```

Look at `after.data[0].id` — that is the Meta app that must have Roles + Messenger webhook config.

2. **App Roles → Instagram Tester** for the **sender** Instagram account → invite must show **Accepted** on [instagram.com](https://www.instagram.com/). Prefer Professional (Creator/Business) for the sender if Meta rejects personal accounts.

3. On **API setup with Instagram business login**:
   - Business account webhook toggle **On**
   - Generate a fresh token for that business account into `.env`

4. Critical community fix: also configure webhooks under **Messenger → Instagram settings** on the **same Facebook App** (DMs are routed through Messenger infrastructure even for Instagram Login):

```text
https://developers.facebook.com/apps/{FACEBOOK_APP_ID}/messenger/instagram/
```

- Same Callback URL: `{PUBLIC}/webhooks/instagram`
- Same verify token
- Subscribe **messages** (and optionally messaging_seen / message_reactions)

5. Re-run `ig-subscribe-webhooks.ts` so `subscribed_fields` includes `messages`, `messaging_seen`, `message_reactions`, etc.

6. Tester sends a **new text** DM (opening the thread only produces `read` events — those are not inbox messages).

7. Watch:

```bash
docker logs -f apps-platform-api-1
```

- Success: `POST /webhooks/instagram` + payload containing `message.text`
- Failure pattern you already saw: only `read` / reactions, never `message`

**If after the Messenger product subscribe you still get only reads:**  
this is a known Meta Dev-mode limitation for Instagram Login `messages`. Remaining options:

- Toggle app **Live** (Privacy Policy URL required), still use Instagram Testers until Advanced Access; or
- Switch integration path to **Instagram Messaging via Facebook Page / Messenger** (Page token) which historically behaves better with app roles in Development; or
- Use `POST /api/v1/dev/simulate-inbound` for product UI work without Meta DM delivery.

### 5.7 Platform steps

```env
INSTAGRAM_PAGE_ID="..."
INSTAGRAM_ACCESS_TOKEN="IGAA..."
INSTAGRAM_VERIFY_TOKEN="your-shared-secret"
INSTAGRAM_APP_SECRET="..."
INSTAGRAM_APP_ID="..."
INSTAGRAM_USERNAME="yourbrand"
PLATFORM_PUBLIC_BASE_URL="https://YOUR-NGROK-HOST"
```

```bash
npm run seed
# rebuild/restart API so env is loaded in Docker
```

Verify challenge:

```bash
curl "https://YOUR-NGROK-HOST/webhooks/instagram?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=challenge-ok" \
  -H "ngrok-skip-browser-warning: true"
# expect: challenge-ok
```

---

## 6. Gmail API

Gmail inbound uses **Gmail Push via Cloud Pub/Sub** (not Meta webhooks). Outbound uses Gmail API `users.messages.send` with OAuth refresh token.

### 6.1 High-level send / receive

**Receive**

1. Platform calls `users.watch` on the mailbox → Google publishes mailbox changes to Pub/Sub topic.
2. Pub/Sub **Push** subscription POSTs to  
   `{PUBLIC}/webhooks/email/pubsub`.
3. API reads Gmail History → fetches messages → ContactIdentity `email` → Conversation on Gmail Inbox → Message.

**Send**

1. Agent replies on Email tab for a Gmail conversation.
2. Adapter sends via Gmail API using OAuth client + refresh token.
3. Status `sent` / `failed` stored.

### 6.2 Credentials required

| Env var | Purpose |
|---------|---------|
| `GMAIL_CLIENT_ID` | OAuth 2.0 Web client id |
| `GMAIL_CLIENT_SECRET` | OAuth client secret |
| `GMAIL_REFRESH_TOKEN` | Long-lived refresh token (**required** to enable inbox) |
| `GMAIL_ACCESS_TOKEN` | Optional short-lived access token (auto-refreshed via refresh) |
| `GMAIL_PUBSUB_TOPIC` | Full topic name `projects/{project}/topics/{topic}` |

Seed keeps Gmail inbox **disabled** until refresh/access token is present.

### 6.3 How to get credentials (with links)

#### A. Google Cloud project + APIs

1. Console: [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create/select project.
3. Enable **Gmail API**:  
   [https://console.cloud.google.com/apis/library/gmail.googleapis.com](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
4. Enable **Cloud Pub/Sub API**:  
   [https://console.cloud.google.com/apis/library/pubsub.googleapis.com](https://console.cloud.google.com/apis/library/pubsub.googleapis.com)

#### B. OAuth consent screen (Testing)

1. [https://console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)
2. User type: External (typical) → **Testing**.
3. App name, support email, developer contact.
4. Scopes (add):
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
5. **Test users**: add every Google account that will authorize the inbox (e.g. `support@yourbrand.com`).  
   Without this you get **Error 403: access_denied** / “has not completed verification”.

#### C. OAuth client

1. Credentials: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. **Create Credentials → OAuth client ID → Web application**.
3. Authorized redirect URI (exact):

```text
http://localhost:4101/oauth/gmail/callback
```

4. Copy Client ID → `GMAIL_CLIENT_ID`  
5. Copy Client secret → `GMAIL_CLIENT_SECRET`

**Do not** put the ngrok URL in this OAuth redirect for the local helper. Ngrok is only for Pub/Sub push + Meta webhooks.

#### D. Generate refresh token (platform helper)

```bash
cd apps/platform-api
npm run gmail:oauth
```

1. Script prints a Google consent URL.
2. Sign in as the **mailbox account** that should receive/send support mail (must be listed as OAuth **Test user**).
3. Approve scopes.
4. Browser redirects to `http://localhost:4101/oauth/gmail/callback`.
5. Terminal prints `GMAIL_REFRESH_TOKEN` / `GMAIL_ACCESS_TOKEN` — paste into `.env`.

If no refresh token is returned: revoke the app at [https://myaccount.google.com/permissions](https://myaccount.google.com/permissions) and run `npm run gmail:oauth` again (`prompt=consent`).

#### E. Pub/Sub topic + push subscription

1. Topics: [https://console.cloud.google.com/cloudpubsub/topic/list](https://console.cloud.google.com/cloudpubsub/topic/list)
2. Create topic, e.g. `gmail-events`.
3. Set:

```env
GMAIL_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-events"
```

4. **Topic → Permissions → Grant access**
   - Principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher** (`roles/pubsub.publisher`)  
     Search for “publisher” if the short list only shows Admin/Viewer/Subscriber/Editor.  
     You can also run in Cloud Shell:

```bash
gcloud pubsub topics add-iam-policy-binding gmail-events \
  --project=YOUR_PROJECT_ID \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher"
```

5. Create **Subscription** on that topic:
   - Delivery type: **Push**
   - Endpoint URL (after seed — use printed id):

```text
https://YOUR-NGROK-HOST/webhooks/email/pubsub
```

   - Enable authentication: **Off** (dev simplicity)
   - Payload unwrapping: **Off** (API expects standard Pub/Sub envelope)
   - Ack deadline: 10–60s

### 6.4 Development “test users” (Google)

| Layer | Who to add | Where |
|-------|------------|--------|
| OAuth consent **Test users** | The Gmail mailbox identity (and any human who runs `gmail:oauth`) | OAuth consent screen → Test users |
| Physical testers | People who send email **to** that mailbox | No Google role needed — any sender can email the watched address once watch is on |

Unlike Instagram, inbound email does **not** require the customer to be a Google test user. The restriction is on **who can authorize the OAuth app** while the consent screen is in Testing.

### 6.5 Platform steps to enable watch

```env
GMAIL_CLIENT_ID="....apps.googleusercontent.com"
GMAIL_CLIENT_SECRET="GOCSPX-..."
GMAIL_REFRESH_TOKEN="1//..."
GMAIL_ACCESS_TOKEN="ya29...."   # optional
GMAIL_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-events"
PLATFORM_PUBLIC_BASE_URL="https://YOUR-NGROK-HOST"
```

```bash
npm run seed
```

Seed output shows Gmail `enabled: true` and `pubsubPush` URL — paste that exact URL into the Pub/Sub push subscription if you have not already.

Start watch (authenticated API call):

```http
POST /api/v1/gmail/watch
Authorization: Bearer {JWT from admin login}
Content-Type: application/json

{ "inboxId": "{GMAIL_INBOX_ID}" }
```

Success returns `historyId` and `expiresAt` (watch must be renewed before expiry; use `POST /api/v1/gmail/renew-watch` as needed).

Test:

1. From any mailbox, email the watched address.
2. Docker logs: `POST /webhooks/email/.../pubsub`
3. Agent Inbox shows Email conversation → reply works via Gmail API.

---

## 7. Agent Inbox UI behaviour

- Left list defaults to **Active** (`open` + `pending`). **Resolved** threads are hidden until you click **All**.
- New inbound messages reopen resolved conversations to `open`.
- Channel tabs (WhatsApp / Instagram / Email) appear for the selected contact.
- Customer Context panel is toggleable (not always open).
- Failed outbound messages show failed status; toast shows provider error when available.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No Meta/Gmail POST in Docker logs | Tunnel down / wrong `PLATFORM_PUBLIC_BASE_URL` / API not running | Fix ngrok, reseed, restart API |
| WhatsApp outbound fails, inbound works | Access token expired (OAuth 190) | New token → `.env` → `npm run seed` → restart |
| Instagram DM from friend never arrives | App Development mode; sender not Instagram Tester | Add Instagram Tester + accept invite on **same App ID** |
| Instagram Tester form error | Bad username / personal account limits | Exact username, Professional account, search-select |
| Gmail OAuth `redirect_uri_mismatch` | Redirect URI not exact | Add `http://localhost:4101/oauth/gmail/callback` only |
| Gmail OAuth `access_denied` / verification | Consent Testing, user not Test user | Add account under Test users |
| Gmail watch “not authorized” Pub/Sub | Topic missing Publisher for Gmail push SA | Grant `gmail-api-push@system.gserviceaccount.com` Pub/Sub Publisher |
| Gmail inbox `enabled: false` after seed | Missing refresh token | Run `npm run gmail:oauth`, paste token, seed again |
| Conversation missing in UI | Filtered as Resolved | Switch to **All** |
| Mixing Meta App IDs | Token from app A, webhooks/roles on app B | Use one app end-to-end |

Health checks:

```bash
curl http://localhost:4100/health
curl -H "ngrok-skip-browser-warning: true" https://YOUR-NGROK-HOST/health
docker logs -f apps-platform-api-1
```

---

## 9. Credential quick reference

### `.env` block template

```env
PLATFORM_PUBLIC_BASE_URL="https://YOUR-NGROK-HOST"

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_VERIFY_TOKEN=""
WHATSAPP_APP_SECRET=""
WHATSAPP_BUSINESS_ACCOUNT_ID=""

# Instagram
INSTAGRAM_PAGE_ID=""
INSTAGRAM_ACCESS_TOKEN=""
INSTAGRAM_VERIFY_TOKEN=""
INSTAGRAM_APP_SECRET=""
INSTAGRAM_APP_ID=""
INSTAGRAM_USERNAME=""

# Gmail
GMAIL_CLIENT_ID=""
GMAIL_CLIENT_SECRET=""
GMAIL_REFRESH_TOKEN=""
GMAIL_ACCESS_TOKEN=""
GMAIL_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-events"
```

### After every credential / public URL change

```bash
cd apps/platform-api
npm run seed
# restart platform-api container or process so env reloads
```

### Development testers cheat-sheet

| Channel | Who must be allow-listed | Where |
|---------|--------------------------|--------|
| WhatsApp | Personal phone numbers in WA **API Setup → To** | Meta App → WhatsApp → API Setup |
| Instagram | Sender Instagram account as **Instagram Tester** (must accept) | Meta App → App roles → Roles |
| Gmail (OAuth) | Mailbox Google account as OAuth **Test user** | Google Cloud → OAuth consent → Test users |
| Gmail (customers emailing you) | Nobody special | Anyone can email the watched address once watch works |

### End-to-end happy path (dev)

1. Start API + ngrok; set `PLATFORM_PUBLIC_BASE_URL`.
2. Configure WA + IG webhooks to `{PUBLIC}/webhooks/{channel}` with verify tokens.
3. Configure Gmail Pub/Sub push + topic IAM; run `gmail:oauth`; seed; start watch.
4. Add WA recipient numbers / IG Instagram Testers / Google OAuth test users.
5. Send inbound test on each channel → confirm Docker webhook logs → reply from Agent Inbox.

---

## Related docs

- Database bootstrap: [`apps/platform-api/BOOTSTRAP.md`](../apps/platform-api/BOOTSTRAP.md)
- Platform overview: [`docs/PLATFORM.md`](./PLATFORM.md)
- Env template: [`apps/platform-api/.env.example`](../apps/platform-api/.env.example)

---

*Scope: Development configuration only. Moving Meta apps to Live / Google verification for sensitive scopes is a separate production readiness process.*
