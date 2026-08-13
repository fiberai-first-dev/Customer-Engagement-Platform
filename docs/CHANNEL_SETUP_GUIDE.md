# Channel setup guide

Hosted CEP Frontend URL: `https://cep-svasthyaa.fybud.com` (`PLATFORM_WEB_BASE_URL`)  
Hosted CEP API URL: `https://api.cep-svasthyaa.fybud.com` (`PLATFORM_API_BASE_URL`)

Brands configure WhatsApp, Instagram, Gmail, and Shopify in **Settings**. Credentials are created in Meta, Google Cloud, or Shopify Admin, then entered in CEP. No local install is required.

A printable copy of this guide is available in CEP: **Settings → Download setup guide (PDF)**.

## Fixed URLs

Register these values in provider consoles. Trailing slashes and host must match.

| Purpose | URL |
|---------|-----|
| Agent UI / login | `https://cep-svasthyaa.fybud.com` |
| WhatsApp webhook | `https://api.cep-svasthyaa.fybud.com/webhooks/whatsapp` |
| Instagram webhook | `https://api.cep-svasthyaa.fybud.com/webhooks/instagram` |
| Gmail Pub/Sub push | `https://api.cep-svasthyaa.fybud.com/webhooks/email/pubsub` |
| Gmail OAuth redirect | `https://api.cep-svasthyaa.fybud.com/oauth/gmail/callback` |
| Instagram OAuth redirect | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/callback` |
| Instagram deauthorize | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/deauthorize` |
| Instagram data deletion | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/data-deletion` |
| Privacy policy | `https://api.cep-svasthyaa.fybud.com/privacy` |

The same list appears under Settings → Callback URLs (dropdown + Copy).

Suggested order of work: enable APIs/scopes below → WhatsApp → Instagram → Gmail → Shopify.

---

## Replies sent outside CEP (phone / app)

Agents sometimes reply in Instagram, Gmail, or WhatsApp Business instead of CEP. Whether those replies appear in the portal depends on the channel:

| Channel | Extra Meta / Google config for “echoes”? | What you need |
|---------|------------------------------------------|---------------|
| **Instagram** | **No change** | Same webhook as today (`messages`). CEP already treats app replies as outgoing. |
| **Gmail** | **No change** | Same Connect + **Start watch**. CEP already picks up SENT mail. |
| **WhatsApp** | **Yes — Coexistence is required** | Without Coexistence, Meta never sends phone/app replies to your webhook. Subscribing a field alone is not enough. See §2.9. |

In short: Instagram and Gmail work with the normal setup you already do. WhatsApp phone replies only work if Meta Coexistence is on.

---

## 0. APIs, scopes, and permissions (required)

Do this **before** clicking Connect in CEP. Missing APIs or scopes is the most common setup failure.

### WhatsApp (Meta)

| Item | What to enable |
|------|----------------|
| Product | **WhatsApp** on the Meta app |
| System User token scopes | `whatsapp_business_messaging`, `whatsapp_business_management`, and `business_management` if listed |
| Webhook fields | **`messages`** (required for inbox). To also show replies sent from the WhatsApp Business phone/app, subscribe **`smb_message_echoes`** — and the number **must** use Meta **Coexistence** (§2.9). Without Coexistence, echoes never arrive. |
| Assets | System User must be assigned the Meta **App** + **WhatsApp Business Account** with manage permissions |

### Instagram (Meta)

| Item | What to enable |
|------|----------------|
| Product | **Instagram** → **API setup with Instagram login** (Business Login) |
| OAuth scopes (CEP requests these) | `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments` |
| Webhook fields | **`messages`** only. No separate “echo” field — Instagram app replies use the same webhook. |
| Business login URLs | OAuth redirect, deauthorize, and data deletion (see Fixed URLs) |
| Account type | Instagram **Professional** (Business or Creator) |

Use the **Instagram app ID / Instagram app secret** from the Instagram product page — not the global Meta App ID/Secret under App settings → Basic.

### Gmail (Google Cloud)

| Item | What to enable |
|------|----------------|
| APIs | **Gmail API** + **Cloud Pub/Sub API** (both must be enabled on the project) |
| OAuth scopes (consent screen) | `https://www.googleapis.com/auth/gmail.modify` and `https://www.googleapis.com/auth/gmail.send` |
| OAuth client | Web application client; redirect = Gmail OAuth URL above |
| Pub/Sub topic IAM | Principal `gmail-api-push@system.gserviceaccount.com` role **Pub/Sub Publisher** on the topic |
| Pub/Sub subscription | Push to Gmail Pub/Sub URL above |
| Your Google identity | Prefer a project **Owner** or role that can enable APIs, create OAuth clients, and edit Pub/Sub IAM (e.g. `roles/pubsub.admin` or Owner on the project) |

### Shopify

| Item | What to enable |
|------|----------------|
| Admin API scopes | `read_customers`, `read_orders` (minimum) |

---

## 1. Open Settings

1. Sign in at `https://cep-svasthyaa.fybud.com`.
2. Open **Settings** in the left navigation.
3. **Channels** lists WhatsApp, Instagram, and Gmail (Connect / Disconnect).
4. **Shopify** is listed under Channels for store customers and orders.
5. After Connect, details are stored securely. Disconnect clears that connection.
6. **Gmail and Instagram tokens are automatic.** You never paste Access or Refresh tokens. After you Connect and finish Google or Instagram login, they are stored for you (see §§3.3 and 4.5).

---

## 2. WhatsApp

### Fields in Settings → Connect WhatsApp

| Field | Meaning |
|-------|---------|
| Phone Number ID | Cloud API id of the business number (numeric id from Meta, not `+91…`) |
| Access Token | Bearer token used for Graph API send/receive |
| Verify Token | Shared secret you choose; must match the Meta webhook config |
| App Secret | Meta app secret (App settings → Basic; see 2.4) |
| Business Account ID | WhatsApp Business Account (WABA) id |

Connect only enables after required fields are filled. Save happens when you click **Connect**. Disconnect clears credentials.

### 2.1 Meta app and WhatsApp product

1. Open https://developers.facebook.com/apps/
2. Create an app (Business) or select an existing one.
3. Add the **WhatsApp** product.
4. Open **WhatsApp → API Setup**  
   `https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-dev-console/`

### 2.2 Phone Number ID

1. On API Setup, locate the connected business phone number.
2. Copy **Phone number ID**.
3. Paste into CEP → Phone Number ID.

### 2.3 Business Account ID

1. On API Setup, copy **WhatsApp Business Account ID**, or find it in WhatsApp Manager for that WABA.
2. Paste into CEP → Business Account ID.

### 2.4 App ID and App Secret

These values live on Meta’s **App settings → Basic** page (not under WhatsApp API Setup).

1. Open your app in https://developers.facebook.com/apps/
2. Left sidebar: **App settings → Basic**
3. Copy **App ID**.
4. Next to **App secret**, click **Show**, then copy.
5. Paste **App Secret** into CEP WhatsApp settings.

Instagram uses a different App ID/Secret pair — see section 3.

### 2.5 Verify Token

1. Choose a string without spaces (example: `cep-wa-verify-<brand>`).
2. Enter it in CEP → Verify Token.
3. Enter the same string when configuring the Meta webhook (section 2.7).

### 2.6 Access Token (System User) — scopes

Tokens shown on API Setup often expire in about 24 hours. Use a System User token.

1. Business Settings: https://business.facebook.com/latest/settings  
2. **Users → System users → Add** (Admin).
3. **Assign assets**: Meta app (Full control) + WhatsApp account (manage WABA).
4. **Generate token** for the same Meta app with at least:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management` (if listed)
5. Prefer non-expiring when Meta offers it.
6. Paste into CEP → Access Token → **Connect**.

### 2.7 WhatsApp webhook

1. Meta app → Webhooks or WhatsApp → Configuration.
2. Callback URL: `https://api.cep-svasthyaa.fybud.com/webhooks/whatsapp`
3. Verify token: same as CEP.
4. Verify and save.
5. Subscribe fields:
   - **`messages`** — required (customer messages into CEP)
   - **`smb_message_echoes`** — only useful if the number is on **Coexistence** (§2.9). If the number is Cloud API–only, this field stays quiet and CEP will never see phone replies.

### 2.8 Smoke test

1. Send a WhatsApp message to the business number from a customer phone.
2. Confirm the thread in CEP Inbox (WhatsApp) and reply within the messaging window.

### 2.9 WhatsApp phone / Business app replies — Coexistence required

If an agent replies from the **WhatsApp Business app on the phone**, CEP can show that message — but **only when Meta Coexistence is enabled**. This is a Meta product requirement, not a CEP toggle.

**Why it matters**

- With a normal Cloud API–only number, Meta does **not** send the text of phone replies to your webhook.
- CEP cannot invent those messages. No amount of Settings clicks will fix a Cloud API–only number.
- Coexistence means the **same phone number** stays on WhatsApp Business app **and** Cloud API together. Then Meta can send `smb_message_echoes` when someone replies from the app.

**What you must have**

1. The business number onboarded with Meta’s **Coexistence / WhatsApp Business app onboarding** (not “API number only”).  
   Guide: https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users/
2. Webhook field **`smb_message_echoes`** subscribed (§2.7).
3. WhatsApp Business app still installed on the phone — open it at least every ~13 days so Meta keeps the link alive.

**Quick check**

- Phone app still works on that number after Cloud API setup → you may already be on Coexistence → subscribe `smb_message_echoes` and test a phone reply.
- Phone app stopped / number is API-only → Coexistence was never enabled → phone replies will **never** appear in CEP until the number is re-onboarded with Coexistence.

Instagram and Gmail do **not** need an equivalent step — their outside-app replies use the normal webhook / Start watch setup above.

---

## 3. Instagram

CEP uses **Business Login for Instagram**. You enter App ID, App Secret, and Verify Token only. **Access Token** and **Username** are filled automatically after Connect — do not type them by hand, and do not enter a Page ID.

### Fields in Settings → Connect Instagram

| Field | Who fills it |
|-------|----------------|
| Instagram App ID | You (from Meta Instagram API setup page) |
| Instagram App Secret | You (same page) |
| Verify Token | You (choose any shared secret) |
| Access Token | **CEP — automatic after Instagram login** (not shown for you to paste) |
| Username | **CEP — automatic after Instagram login** |

Important: Instagram App ID and Instagram App Secret are **not** the Meta App ID / App Secret from **App settings → Basic**.

### 3.1 APIs / product / scopes

1. Meta app → add **Instagram** product.
2. Open **Instagram → API setup with Instagram login**.
3. Copy **Instagram app ID** and **Instagram app secret** into CEP.
4. When the agent completes Connect, CEP requests these scopes:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_manage_comments`
5. In Meta App Review / Instagram permissions, ensure messaging-related permissions for your use case are requested/approved as Meta requires for production.

### 3.2 Business login URLs in Meta

1. Still under Instagram → API setup with Instagram login → **Business login settings**.
2. Set:

| Field | URL |
|-------|-----|
| OAuth redirect URIs | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/callback` |
| Deauthorize callback URL | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/deauthorize` |
| Data deletion request URL | `https://api.cep-svasthyaa.fybud.com/oauth/instagram/data-deletion` |

3. Save in Meta.

Also set Privacy policy URL if asked: `https://api.cep-svasthyaa.fybud.com/privacy`

### 3.3 Connect Instagram (Access Token is automatic)

You do **not** paste an Access Token. CEP gets it from Meta after login.

1. Settings → Instagram → **Connect**.
2. In the modal, enter **Instagram App ID**, **Instagram App Secret**, and **Verify Token** (Connect stays disabled until these are filled).
3. Click **Connect** — CEP saves those three fields, then opens Instagram login.
4. Approve as the business Instagram account that should receive DMs.
5. Meta returns a code; CEP exchanges it for a short-lived token, then upgrades it to a **long-lived Access Token** (~60 days) and stores it **only on the server**, along with the Instagram **Username**.
6. You land back on Settings with Instagram **Connected**. You never see or type the Access Token in the form.

If Connect fails, check Business login URLs (§3.2) and that you used the Instagram app ID/secret (not Meta App ID from Basic).

Replies sent in the **Instagram app** show in CEP as outgoing automatically. You do **not** enable a separate echo setting — keep the normal `messages` webhook (§3.4).

### 3.4 Instagram webhook

1. Meta Webhooks (Instagram messaging).
2. Callback: `https://api.cep-svasthyaa.fybud.com/webhooks/instagram`
3. Verify token: Instagram Verify Token from CEP.
4. Subscribe **`messages`**.

### 3.5 Smoke test

1. From a customer Instagram account, DM the business account.
2. Confirm Inbox → Instagram; reply from CEP and optionally from the Instagram app.

---

## 4. Gmail

### Fields in Settings → Connect Gmail

| Field | Who fills it |
|-------|----------------|
| Client ID | You (Google Cloud OAuth web client) |
| Client Secret | You (same client) |
| Pub/Sub Topic | You (`projects/{PROJECT_ID}/topics/{TOPIC}`) |
| Refresh Token | **CEP — automatic after Google login** (never paste this) |
| Access Token | **CEP — automatic after Google login**; CEP refreshes it later using the refresh token |

After Connect succeeds, click **Start watch** so push mail (INBOX + SENT) can arrive.

### 4.1 Project role and APIs (enable these)

Use a Google account that can administer the project (Owner, or Editor + ability to change IAM).

1. Open https://console.cloud.google.com/ and select (or create) a project.
2. Enable **Gmail API**:  
   https://console.cloud.google.com/apis/library/gmail.googleapis.com  
3. Enable **Cloud Pub/Sub API**:  
   https://console.cloud.google.com/apis/library/pubsub.googleapis.com  

Both APIs must show **Enabled**. If either is off, Connect / watch will fail.

### 4.2 OAuth consent screen — scopes

1. https://console.cloud.google.com/apis/credentials/consent  
2. Configure External (typical) app details and support email.
3. **Add scopes** (Edit app → Scopes):
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
4. Publish the app, **or** until published add the support mailbox under **Test users**.

CEP requests exactly those two scopes at Connect time.

### 4.3 OAuth client

1. https://console.cloud.google.com/apis/credentials  
2. Create credentials → OAuth client ID → **Web application**.
3. Authorized redirect URI:  
   `https://api.cep-svasthyaa.fybud.com/oauth/gmail/callback`
4. Copy Client ID and Client Secret for CEP.

### 4.4 Pub/Sub topic, admin permission, and push subscription

You need permission to create topics and edit **topic IAM** (project Owner, or a role such as **Pub/Sub Admin** `roles/pubsub.admin`).

1. Topics: https://console.cloud.google.com/cloudpubsub/topic/list  
2. **Create topic** (example name: `gmail-events`).
3. Open the topic → **Permissions** (or **Show info panel → Permissions**).
4. **Grant access**:
   - Principal: `gmail-api-push@system.gserviceaccount.com`  
     (this is Google’s Gmail push service account — not your user)
   - Role: **Pub/Sub Publisher** (`roles/pubsub.publisher`)
5. Create a **subscription** on that topic:
   - Delivery type: **Push**
   - Endpoint URL: `https://api.cep-svasthyaa.fybud.com/webhooks/email/pubsub`
   - Leave authentication / payload unwrapping off unless your ops standard requires otherwise
6. Copy the full topic resource name into CEP:  
   `projects/{PROJECT_ID}/topics/{TOPIC}`

Without the Publisher grant to `gmail-api-push@system.gserviceaccount.com`, Gmail `users.watch` fails or never pushes.

### 4.5 Connect Gmail and Start watch (tokens are automatic)

You do **not** paste Refresh Token or Access Token. CEP gets both from Google after login.

1. Settings → Gmail → **Connect**.
2. In the modal, enter **Client ID**, **Client Secret**, and **Pub/Sub Topic** (Connect stays disabled until these are filled).
3. Click **Connect** — CEP saves those fields, then opens Google login.
4. Sign in as the **support mailbox** and approve the Gmail scopes.
5. Google returns tokens; CEP stores **Refresh Token** and **Access Token** **only on the server** (and the mailbox address when available).
6. You land back on Settings with Gmail **Connected**. Token fields are not something you type or copy into the UI.
7. Click **Start watch** (INBOX + SENT). Watch lasts up to ~7 days — renew before expiry.

Day to day, CEP uses the refresh token to get new access tokens when the short-lived access token expires (~1 hour). You only click **Connect** again if Google revoked the app (password change, permissions removed, etc.).

If Google does not issue a refresh token, revoke the app at https://myaccount.google.com/permissions and Connect again.

Replies sent in **Gmail web or the Gmail app** show in CEP as outgoing automatically (via SENT). You do **not** enable a separate echo setting — Connect + **Start watch** is enough.

### 4.6 Watch ops

Google’s Gmail push watch is **not permanent**. Call watch at least every **7 days** or push stops.

1. **Start watch** in Settings after Connect.
2. Send a test message to the mailbox; confirm Inbox → Email.
3. CEP renews watch on API container restart; if the API stays up longer than a week, click **Start watch** again.

---

## 5. Shopify

Connect Shopify to show customers and orders in the inbox.

### Fields in Settings → Shopify

| Field | Value |
|-------|--------|
| Shop subdomain | Subdomain only (`yourbrand` from `yourbrand.myshopify.com`) |
| Client ID | App client id |
| Client Secret | App client secret |

### Required Admin API scopes

Minimum:

- `read_customers`
- `read_orders`

1. Create or open the app in Shopify Partner / Dev dashboard.
2. Install on the store with those scopes.
3. CEP Settings → Shopify → **Connect** with subdomain, Client ID, Client Secret.

Inbound linking: WhatsApp/Email can attach Shopify email/phone onto the contact. Instagram has no phone/email lookup.

---

## 6. Inbox: clear chat and delete messages

### Clear the whole channel thread

1. Open the contact in **Inbox** and select the channel tab.
2. Open the ⋮ menu → **Clear chat** → confirm.
3. Messages for that channel are removed and tombstoned so sync does not resurrect them.

### Delete specific messages

1. ⋮ → **Select** → pick messages → **Delete** → confirm.

---

## 7. Keeping channels online

### WhatsApp

| Item | What you do |
|------|-------------|
| Temporary API Setup token | Do not use in production (~24h) |
| System User token | Prefer non-expiring; paste into Connect |
| App Secret / Phone Number ID / Verify Token | Update Settings if you rotate them in Meta |

### Instagram

| Item | What you do |
|------|-------------|
| Access Token | Filled **automatically** on Connect; lasts ~60 days. Click **Connect** again before it expires (you still only enter App ID / Secret / Verify Token — token is fetched again). |
| Instagram App ID / Secret | Re-enter if reset in Meta |

### Gmail

| Item | What you do |
|------|-------------|
| Access Token | Filled **automatically** on Connect; expires ~hourly — CEP refreshes it using the refresh token (no manual step) |
| Refresh Token | Filled **automatically** on Connect; click Connect again only if Google revoked the app |
| `users.watch` | Renew with **Start watch** at least weekly if the API is not restarted often |

---

## 8. Verification

| Step | WhatsApp | Instagram | Gmail | Shopify |
|------|----------|-----------|-------|---------|
| APIs / scopes | Token scopes + webhook fields | IG product + OAuth scopes + `messages` | Gmail API + Pub/Sub API + OAuth scopes + topic Publisher | `read_customers`, `read_orders` |
| Credentials in Settings | Connect (paste WA token) | Connect (App ID/Secret/Verify only — **Access Token automatic**) | Connect (Client ID/Secret/Topic only — **Refresh + Access Token automatic**) + Start watch | Connect |
| Provider config | Webhook verified | Business login URLs + webhook | Redirect URI + push subscription | App installed |
| Functional check | Inbound + reply | Customer DM + reply | Inbound email + reply | Customer panel shows orders |

---

## 9. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Webhook verification failed | Callback URL or Verify Token mismatch; API unreachable |
| WhatsApp stops after ~24h | Temporary API Setup token; use System User token |
| WhatsApp phone replies missing in CEP | **Coexistence not enabled** (Cloud API–only number), and/or `smb_message_echoes` not subscribed. Instagram/Gmail do not need an extra echo config. |
| Send fails, receive works | Token/scopes/Phone Number ID |
| Instagram Connect error | Redirect / deauthorize / data-deletion URL still on old host; or used Meta App ID from Basic |
| IG DMs not arriving | Webhook URL/token mismatch, or `messages` not subscribed |
| Gmail API / Pub/Sub “not enabled” | Enable both APIs on the Google project (§4.1) |
| Gmail watch / push errors | Topic missing **Pub/Sub Publisher** for `gmail-api-push@system.gserviceaccount.com` (§4.4) |
| Gmail `redirect_uri_mismatch` | OAuth client missing hosted Gmail callback URL |
| Gmail `access_denied` | Consent screen not published / mailbox not a test user |
| New Gmail stops after ~7 days | Watch expired; click Start watch |
| Empty Shopify panel | Wrong shop, missing scopes, or email/phone mismatch |

---

## URL reference

```
https://cep-svasthyaa.fybud.com
https://api.cep-svasthyaa.fybud.com/webhooks/whatsapp
https://api.cep-svasthyaa.fybud.com/webhooks/instagram
https://api.cep-svasthyaa.fybud.com/webhooks/email/pubsub
https://api.cep-svasthyaa.fybud.com/oauth/gmail/callback
https://api.cep-svasthyaa.fybud.com/oauth/instagram/callback
https://api.cep-svasthyaa.fybud.com/oauth/instagram/deauthorize
https://api.cep-svasthyaa.fybud.com/oauth/instagram/data-deletion
https://api.cep-svasthyaa.fybud.com/privacy
```
