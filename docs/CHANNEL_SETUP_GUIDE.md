# Channel setup guide

Connect WhatsApp, Instagram, Gmail, and Shopify in **Settings**. Create the credentials in Meta, Google Cloud, or Shopify Admin, then enter them here.

Whenever Meta or Google asks for a URL, open **Settings → Callback URLs**, pick the matching item, and copy it. Paste that into the provider console.

A printable copy of this guide is in CEP: **Settings → Download setup guide**.

Suggested order: enable APIs and scopes below → WhatsApp → Instagram → Gmail → Shopify.

---

## Replies sent outside CEP (phone / app)

Agents sometimes reply in Instagram, Gmail, or WhatsApp Business instead of CEP. Whether those replies appear in the portal depends on the channel:

| Channel | Extra Meta / Google setup? | What you need |
|---------|----------------------------|---------------|
| **Instagram** | **No** | Same webhook as today (`messages`). App replies already show as outgoing. |
| **Gmail** | **No** | Same Connect + **Start watch**. Sent mail already shows up. |
| **WhatsApp** | **Yes — Coexistence is required** | Without Coexistence, Meta never sends phone/app replies to your webhook. Subscribing a field alone is not enough. See §2.9. |

Instagram and Gmail work with the normal setup. WhatsApp phone replies only work if Meta Coexistence is on.

---

## 1. Before you start

You need:

- Access to CEP **Settings** (and the PDF from there, if you want a printout)
- Meta Business / Developer access (WhatsApp + Instagram)
- A Google Cloud project you can administer (Gmail)
- Shopify Partner or store admin (optional, for orders)

Open **Settings → Callback URLs** and keep that page handy. Every webhook, login redirect, and privacy URL you paste into Meta or Google comes from there.

---

## 2. WhatsApp

### Fields in Settings → Connect WhatsApp

| Field | Where it comes from |
|-------|---------------------|
| Phone Number ID | Meta → WhatsApp → API Setup |
| Access Token | System User token (see 2.6) — not the short-lived token on API Setup |
| Verify Token | You choose this; same value in Meta webhook |
| App Secret | Meta App settings → Basic (WhatsApp Meta app) |
| Business Account ID | WABA id (optional but useful) |

Click **Connect** when the required fields are filled.

### 2.1 Create / select the Meta app

1. https://developers.facebook.com/apps/
2. Use an existing app with **WhatsApp** or create one (Business type).
3. Add product **WhatsApp**.

### 2.2 Phone Number ID

1. WhatsApp → API Setup.
2. Copy **Phone number ID** into CEP.

### 2.3 WhatsApp Business Account ID

1. Same API Setup page, or Business Settings → WhatsApp accounts.
2. Paste into CEP if shown.

### 2.4 App Secret (WhatsApp Meta app)

1. App settings → Basic.
2. Show **App Secret**, copy it.
3. Paste into CEP → App Secret.

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
2. Callback URL: copy **WhatsApp webhook** from CEP **Settings → Callback URLs**.
3. Verify token: same as CEP.
4. Verify and save.
5. Subscribe fields:
   - **`messages`** — required (customer messages into CEP)
   - **`smb_message_echoes`** — only useful if the number is on **Coexistence** (§2.9). If the number is Cloud API–only, this field stays quiet and CEP will never see phone replies.

### 2.8 Try it

1. Send a WhatsApp message to the business number from a customer phone.
2. Confirm the thread in Inbox (WhatsApp) and reply within the messaging window.

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
| Access Token | **Filled for you after Instagram login** |
| Username | **Filled for you after Instagram login** |

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
2. Copy each value from CEP **Settings → Callback URLs** and paste into Meta:

| Field in Meta | Pick this in Callback URLs |
|---------------|----------------------------|
| OAuth redirect URIs | Instagram OAuth redirect |
| Deauthorize callback URL | Instagram deauthorize |
| Data deletion request URL | Instagram data deletion |
| Privacy policy URL (if asked) | Privacy policy |

3. Save in Meta.

### 3.3 Connect Instagram (Access Token is automatic)

You do **not** paste an Access Token. CEP gets it from Meta after login.

1. Settings → Instagram → **Connect**.
2. In the modal, enter **Instagram App ID**, **Instagram App Secret**, and **Verify Token** (Connect stays disabled until these are filled).
3. Click **Connect** — CEP saves those three fields, then opens Instagram login.
4. Approve as the business Instagram account that should receive DMs.
5. After you approve, CEP fetches a long-lived Access Token and the Instagram Username for you.
6. You land back on Settings with Instagram **Connected**. You never see or type the Access Token.

If Connect fails, check Business login URLs (§3.2) and that you used the Instagram app ID/secret (not Meta App ID from Basic).

Replies sent in the **Instagram app** show in CEP as outgoing automatically. You do **not** enable a separate echo setting — keep the normal `messages` webhook (§3.4).

### 3.4 Instagram webhook

1. Meta Webhooks (Instagram messaging).
2. Callback: copy **Instagram webhook** from **Settings → Callback URLs**.
3. Verify token: Instagram Verify Token from CEP.
4. Subscribe **`messages`**.

### 3.5 Try it

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
| Refresh Token | **Filled for you after Google login** |
| Access Token | **Filled for you after Google login**; CEP refreshes it later |

After Connect succeeds, click **Start watch** so new mail (inbox and sent) can arrive.

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
3. Authorized redirect URI: copy **Gmail OAuth redirect** from **Settings → Callback URLs**.
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
   - Endpoint URL: copy **Gmail push URL** from **Settings → Callback URLs**
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
5. After you approve, CEP saves the tokens and mailbox for you.
6. You land back on Settings with Gmail **Connected**. You never type token fields.
7. Click **Start watch** (inbox + sent). Watch lasts up to ~7 days — renew before it expires.

Day to day, CEP keeps the connection alive. You only click **Connect** again if Google revoked the app (password change, permissions removed, etc.).

If Google does not issue a refresh token, revoke the app at https://myaccount.google.com/permissions and Connect again.

Replies sent in **Gmail web or the Gmail app** show in CEP as outgoing automatically. You do **not** enable a separate echo setting — Connect + **Start watch** is enough.

### 4.6 Watch ops

Google’s Gmail push watch is **not permanent**. Call watch at least every **7 days** or push stops.

1. **Start watch** in Settings after Connect.
2. Send a test message to the mailbox; confirm Inbox → Email.
3. CEP renews watch when the API restarts; if it stays up longer than a week, click **Start watch** again.

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

WhatsApp and Email can match a Shopify customer by email or phone. Instagram cannot, because there is no phone or email on the thread.

---

## 6. Inbox: clear chat and delete messages

### Clear the whole channel thread

1. Open the contact in **Inbox** and select the channel tab.
2. Open the ⋮ menu → **Clear chat** → confirm.
3. Messages for that channel are removed and will not come back from a later sync.

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
| Access Token | Filled for you on Connect; lasts ~60 days. Click **Connect** again before it expires (you still only enter App ID / Secret / Verify Token). |
| Instagram App ID / Secret | Re-enter if reset in Meta |

### Gmail

| Item | What you do |
|------|-------------|
| Access Token | Filled for you on Connect; CEP refreshes it on its own |
| Refresh Token | Filled for you on Connect; click Connect again only if Google revoked the app |
| `users.watch` | Renew with **Start watch** at least weekly if the API is not restarted often |

---

## 8. Verification

| Step | WhatsApp | Instagram | Gmail | Shopify |
|------|----------|-----------|-------|---------|
| APIs / scopes | Token scopes + webhook fields | IG product + OAuth scopes + `messages` | Gmail API + Pub/Sub API + OAuth scopes + topic Publisher | `read_customers`, `read_orders` |
| Credentials in Settings | Connect (paste WA token) | Connect (App ID / Secret / Verify only — Access Token is automatic) | Connect (Client ID / Secret / Topic only — tokens are automatic) + Start watch | Connect |
| Provider config | Webhook verified | Business login URLs + webhook | Redirect URI + push subscription | App installed |
| Try it | Inbound + reply | Customer DM + reply | Inbound email + reply | Customer panel shows orders |

---

## 9. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Webhook verification failed | Copied the wrong Callback URL, or Verify Token mismatch |
| WhatsApp stops after ~24h | Temporary API Setup token; use System User token |
| WhatsApp phone replies missing in CEP | **Coexistence not enabled** (Cloud API–only number), and/or `smb_message_echoes` not subscribed. Instagram/Gmail do not need extra echo config. |
| Send fails, receive works | Token / scopes / Phone Number ID |
| Instagram Connect error | Redirect / deauthorize / data-deletion URL copied from a different site; or used Meta App ID from Basic |
| IG DMs not arriving | Webhook URL/token mismatch, or `messages` not subscribed |
| Gmail API / Pub/Sub “not enabled” | Enable both APIs on the Google project (§4.1) |
| Gmail watch / push errors | Topic missing **Pub/Sub Publisher** for `gmail-api-push@system.gserviceaccount.com` (§4.4) |
| Gmail `redirect_uri_mismatch` | OAuth client missing this site’s Gmail OAuth redirect (copy from Settings) |
| Gmail `access_denied` | Consent screen not published / mailbox not a test user |
| New Gmail stops after ~7 days | Watch expired; click Start watch |
| Empty Shopify panel | Wrong shop, missing scopes, or email/phone mismatch |

---

## Where the URLs live

Every URL you need is under **Settings → Callback URLs**. Copy from there.
