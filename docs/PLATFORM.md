# CEP Platform — messaging API

Own Fastify + Prisma stack for **WhatsApp Cloud API**, **Instagram Messaging**, and **Email**. Inspired by Chatwoot’s inbox model; original code.

## Layout

| Path | Role |
|------|------|
| `apps/platform-api` | Accounts, inboxes, conversations, messages, webhooks |
| `apps/platform-web` | Agent inbox UI (http://localhost:5173) |
| `packages/channels` | Channel adapters (parse inbound + send outbound) |

## Quick start (local)

```bash
cp .env.example .env
docker compose up -d cep-postgres
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm seed
pnpm dev
```

- **UI:** http://localhost:5173  
- **API:** http://localhost:4100  
- Auth: `Authorization: Bearer dev-token-change-me` (same as `PLATFORM_ADMIN_TOKEN`)

Seed creates 3 mock inboxes (WhatsApp, Instagram, Email) with `"mock": true`. Real traffic needs the steps below and `"mock": false`.

---

# Channel integration setup

Meta (WhatsApp + Instagram) and email providers **cannot call `localhost`**. For local/dev you need a public HTTPS tunnel.

## 0) Shared prerequisites (do this once)

### A. Run CEP and note inbox IDs

1. Start the stack (`pnpm dev`).
2. Open **http://localhost:5173 → Settings (Set)** — each inbox shows:
   - Inbox id  
   - **Webhook URL** like `http://localhost:4100/webhooks/whatsapp/<inboxId>`
3. Or via API:

```bash
TOKEN=dev-token-change-me
curl -s http://localhost:4100/api/v1/accounts \
  -H "Authorization: Bearer $TOKEN"

# use account id from response
curl -s http://localhost:4100/api/v1/accounts/<ACCOUNT_ID>/inboxes \
  -H "Authorization: Bearer $TOKEN"
```

Copy the `id` for WhatsApp / Instagram / Email inboxes.

### B. Expose the API publicly (local only)

Pick one:

```bash
# Cloudflare quick tunnel (no account required)
cloudflared tunnel --url http://localhost:4100

# or ngrok
ngrok http 4100
```

Copy the printed HTTPS URL (e.g. `https://xxxx.trycloudflare.com`), then set in `.env` and **restart the API**:

```env
PLATFORM_PUBLIC_BASE_URL=https://YOUR-TUNNEL-HOST
```

Webhook base becomes:

```text
https://YOUR-TUNNEL-HOST/webhooks/{whatsapp|instagram|email}/{inboxId}
```

Keep the tunnel terminal open while testing. Quick tunnels get a **new hostname every time** you restart them — update `.env` + restart API when that happens.

On Railway/production, use your real public API hostname instead of a tunnel.

### C. How to save channel credentials

**UI:** Settings → open an inbox → edit `channelConfig` JSON → **Save**.

**API:**

```bash
curl -s -X PATCH http://localhost:4100/api/v1/inboxes/<INBOX_ID> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"channelConfig":{ ...fields..., "mock": false }}'
```

Secrets already stored are shown as `***` in the UI/API. To change a secret, paste the **full new value**.

Common rule for all channels:

| Field | Meaning |
|-------|---------|
| `"mock": true` | Do not call providers (local dry-run) |
| `"mock": false` | Live send + real webhooks |

---

## 1) WhatsApp Cloud API (Meta)

CEP uses the official **WhatsApp Business Platform → Cloud API**.

### 1.1 Create Meta assets

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Create an **App** → type **Business**.
3. Add product: **WhatsApp**.
4. In WhatsApp → **API Setup**, note:
   - **Phone number ID** → `phoneNumberId`
   - Temporary (or permanent) **access token** → `accessToken`
   - WhatsApp Business Account ID (optional) → `businessAccountId`
5. For production, create a **System User** in Meta Business Manager, assign WhatsApp assets, generate a long-lived token with:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`

### 1.2 Save config in CEP

WhatsApp inbox `channelConfig`:

```json
{
  "phoneNumberId": "YOUR_PHONE_NUMBER_ID",
  "accessToken": "YOUR_ACCESS_TOKEN",
  "verifyToken": "cep-wa-verify",
  "appSecret": "YOUR_APP_SECRET",
  "businessAccountId": "OPTIONAL_WABA_ID",
  "mock": false
}
```

- `verifyToken` is **your** shared secret (any string). You will type the same value into Meta’s webhook UI.
- `appSecret` is from Meta App → Settings → Basic (optional today; useful later for signature verification).

### 1.3 Configure Meta webhook

1. Meta App → WhatsApp → **Configuration** → Webhook → **Edit**.
2. **Callback URL:**

   ```text
   https://YOUR-PUBLIC-HOST/webhooks/whatsapp/<WHATSAPP_INBOX_ID>
   ```

3. **Verify token:** exact same as `verifyToken` (e.g. `cep-wa-verify`).
4. Click **Verify and save**. Meta will `GET` your URL; CEP must return the challenge (already implemented).
5. Subscribe to webhook fields:
   - `messages` (required)

### 1.4 Test WhatsApp

**Receive**

1. From a personal WhatsApp, message your business test number (Meta’s test number works in “To” allowlist).
2. Open CEP UI → Conversations → you should see the inbound message.

**Send**

1. Open that conversation in CEP.
2. Reply and click **Send**.
3. CEP calls `POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages`.

### 1.5 WhatsApp production checklist

- [ ] Business verification (Meta Business Manager)
- [ ] Display name approved
- [ ] Production phone number (not only test number)
- [ ] Long-lived system user token (not the 24h temp token)
- [ ] Customers must message you first (or you use an approved **template**) for the 24h messaging window

---

## 2) Instagram Messaging (Meta)

CEP uses **Instagram Messaging** via a Facebook Page linked to a Professional Instagram account.

### 2.1 Prerequisites

1. Instagram account converted to **Professional** (Business or Creator).
2. Facebook **Page** connected to that Instagram account.
3. Same (or another) Meta App with **Instagram** / Messenger products enabled.
4. In App → Instagram / Messenger settings, request permissions as needed:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `pages_manage_metadata`
   - `pages_messaging`
5. Generate a **Page access token** that can send Instagram DMs → `accessToken`.
6. Note the **Facebook Page ID** (often used as Graph `/{page-id}/messages` recipient host) → `pageId`.

> Depending on your Meta app setup, the ID used for send may be the Page ID. If sends fail with id errors, confirm in Graph API Explorer which ID Meta expects for your app version.

### 2.2 Save config in CEP

Instagram inbox `channelConfig`:

```json
{
  "pageId": "YOUR_PAGE_ID",
  "accessToken": "YOUR_PAGE_ACCESS_TOKEN",
  "verifyToken": "cep-ig-verify",
  "appSecret": "YOUR_APP_SECRET",
  "mock": false
}
```

### 2.3 Configure Meta webhook

1. Meta App → Messenger / Instagram → **Webhooks**.
2. **Callback URL:**

   ```text
   https://YOUR-PUBLIC-HOST/webhooks/instagram/<INSTAGRAM_INBOX_ID>
   ```

3. **Verify token:** same as `verifyToken` (e.g. `cep-ig-verify`).
4. Verify and save.
5. Subscribe the Page / Instagram account to:
   - `messages`
   - (optional) `messaging_postbacks`, `message_echoes` — CEP ignores echoes

### 2.4 Test Instagram

1. From another IG account, send a DM to your business IG profile.
2. Message should appear in CEP Conversations (channel badge **Instagram**).
3. Reply from CEP; outbound uses Graph `POST /{pageId}/messages`.

### 2.5 Instagram gotchas

- Only **Professional** IG accounts linked to a Page work.
- User must message you (or you use allowed messaging tags/templates) inside policy windows.
- App must be in **Live** mode for non-tester accounts; while in Development, only role users can talk to the app.
- Token expiry: use a long-lived Page token or a system user token.

---

## 3) Email (SMTP send + inbound webhook)

CEP email channel today:

| Direction | Mechanism |
|-----------|-----------|
| **Outbound (agent → customer)** | SMTP via Nodemailer (`smtpHost`, `smtpPort`, auth, `fromAddress`) |
| **Inbound (customer → agent)** | HTTP webhook to `/webhooks/email/{inboxId}` |

IMAP fields exist in config for future polling; **inbound today is webhook-based** (recommended: provider inbound parse).

### 3.1 Choose an email approach

**Option A — Transactional provider (recommended)**  
SendGrid, Mailgun, Postmark, Amazon SES, Resend, etc.

- SMTP credentials for sending  
- Inbound Parse / Route that POSTs to your webhook  

**Option B — Google Workspace / Microsoft 365 / cPanel mailbox**

- SMTP for sending (app password if 2FA)  
- For inbound: either forward to a provider inbound parse address, or use a middleware that POSTs JSON to CEP (native IMAP poller is not enabled yet)

### 3.2 Save SMTP config in CEP

Email inbox `channelConfig` example (Gmail/Google Workspace app password):

```json
{
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpSecure": false,
  "smtpUser": "support@yourdomain.com",
  "smtpPass": "YOUR_APP_PASSWORD",
  "fromAddress": "support@yourdomain.com",
  "fromName": "FiberAI Support",
  "mock": false
}
```

Office 365 example:

```json
{
  "smtpHost": "smtp.office365.com",
  "smtpPort": 587,
  "smtpSecure": false,
  "smtpUser": "support@yourdomain.com",
  "smtpPass": "YOUR_PASSWORD",
  "fromAddress": "support@yourdomain.com",
  "fromName": "Support",
  "mock": false
}
```

Generic provider SMTP (SendGrid):

```json
{
  "smtpHost": "smtp.sendgrid.net",
  "smtpPort": 587,
  "smtpSecure": false,
  "smtpUser": "apikey",
  "smtpPass": "SG.xxxxx",
  "fromAddress": "support@yourdomain.com",
  "fromName": "Support",
  "mock": false
}
```

### 3.3 Configure inbound webhook

Point your provider’s inbound parse / receiving route to:

```text
https://YOUR-PUBLIC-HOST/webhooks/email/<EMAIL_INBOX_ID>
```

CEP accepts JSON bodies in these shapes (any one works):

**Generic**

```json
{
  "from": "customer@example.com",
  "fromName": "Customer",
  "subject": "Need help",
  "text": "Where is my order?",
  "id": "optional-unique-message-id"
}
```

**SendGrid Inbound Parse-style** fields (`from`, `subject`, `text` / `html`) and **Mailgun-style** (`sender`, `subject`, `body-plain`) are also parsed.

#### Example: SendGrid Inbound Parse

1. DNS: point MX for a subdomain (e.g. `incoming.yourdomain.com`) to SendGrid.
2. SendGrid → Settings → Inbound Parse → add host + destination URL = CEP webhook above.
3. Customers email `support@incoming.yourdomain.com` (or alias/forward from `support@yourdomain.com`).

#### Example: Mailgun Routes

1. Mailgun → Receiving → Routes.
2. Match recipient `support@yourdomain.com`.
3. Action: forward / store and notify URL = CEP email webhook.

### 3.4 Test email

**Inbound**

```bash
curl -s -X POST https://YOUR-PUBLIC-HOST/webhooks/email/<EMAIL_INBOX_ID> \
  -H "Content-Type: application/json" \
  -d '{
    "from": "customer@example.com",
    "subject": "Help",
    "text": "I need support"
  }'
```

Refresh Conversations in the UI.

**Outbound**

Open that conversation → reply → **Send**. CEP sends via SMTP with `fromAddress`.

### 3.5 Email deliverability tips

- Use a real domain with SPF + DKIM (+ DMARC) for the From address.
- Prefer a transactional ESP over raw consumer Gmail for production.
- `fromAddress` should match a verified sender identity at your ESP.

---

## 4) End-to-end verification checklist

| Step | WhatsApp | Instagram | Email |
|------|----------|-----------|-------|
| Inbox exists (seed or create) | ✓ | ✓ | ✓ |
| `mock: false` + credentials saved | ✓ | ✓ | ✓ |
| `PLATFORM_PUBLIC_BASE_URL` is public HTTPS | ✓ | ✓ | ✓ |
| Provider webhook verified | Meta GET verify | Meta GET verify | Provider posts to webhook |
| Inbound appears in UI | Customer WA msg | Customer IG DM | Inbound POST / real mail |
| Outbound works | Reply in UI | Reply in UI | Reply in UI |

Health check:

```bash
curl -s http://localhost:4100/health
# {"ok":true,"service":"platform-api"}
```

---

## API map

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Points browsers to the UI |
| GET | `/health` | Liveness |
| POST | `/api/v1/accounts` | Create account |
| GET/POST | `/api/v1/accounts/:id/inboxes` | List / create channel inboxes |
| PATCH | `/api/v1/inboxes/:id` | Update name/enabled/channelConfig |
| GET | `/api/v1/conversations` | Conversation list |
| GET | `/api/v1/conversations/:id/messages` | Thread |
| POST | `/api/v1/conversations/:id/messages` | Send reply |
| PATCH | `/api/v1/conversations/:id` | Update status (`open` / `pending` / `resolved`) |
| GET/POST | `/webhooks/:channel/:inboxId` | Provider webhooks |
| POST | `/api/v1/dev/simulate-inbound` | Dev-only fake inbound (no UI button) |

### Dev simulate (optional)

```bash
TOKEN=dev-token-change-me
BASE=http://localhost:4100

curl -s -X POST "$BASE/api/v1/dev/simulate-inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inboxId":"<WHATSAPP_INBOX_ID>","from":"+919876543210","name":"Riya","content":"Hi, where is my order?"}'
```

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Meta “webhook verification failed” | Wrong callback URL / inbox id; API not public; `verifyToken` mismatch; API not running |
| Inbound never shows | Webhook not subscribed to `messages`; app in Dev mode (tester only); tunnel died; wrong inbox id |
| Send fails, reply shows `failed` | `mock` still true empty tokens; expired token; wrong `phoneNumberId` / `pageId`; WA 24h window |
| Email send fails | SMTP host/port/auth wrong; provider blocks; from not verified |
| Email inbound empty | Provider not POSTing JSON fields CEP understands (`from` + `text`/`html`) |
| UI empty / unauthorized | Wrong `VITE_PLATFORM_ADMIN_TOKEN`; API down on :4100 |

Check API logs in the `platform-api` terminal while sending a test message — webhook hits and send errors are logged there.
