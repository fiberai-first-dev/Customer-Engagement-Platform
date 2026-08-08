# Channel setup guide

Hosted CEP Frontend URL: `https://cep.logback-backend-services.online`
Hosted CEP base API URL: `https://cep-api.logback-backend-services.online`

Brands configure WhatsApp, Instagram, Gmail, and Shopify in **Settings**. Credentials are created in Meta, Google Cloud, or Shopify Admin, then entered in CEP. No local install is required.

A printable copy of this guide is available in CEP: **Settings → Download setup guide (PDF)**.

## Fixed URLs

Register these values in provider consoles. Trailing slashes and host must match.

| Purpose | URL |
|---------|-----|
| Agent UI / login | `https://cep.logback-backend-services.online` |
| WhatsApp webhook | `https://cep.logback-backend-services.online/webhooks/whatsapp` |
| Instagram webhook | `https://cep.logback-backend-services.online/webhooks/instagram` |
| Gmail Pub/Sub push | `https://cep.logback-backend-services.online/webhooks/email/pubsub` |
| Gmail OAuth redirect | `https://cep.logback-backend-services.online/oauth/gmail/callback` |
| Instagram OAuth redirect | `https://cep.logback-backend-services.online/oauth/instagram/callback` |
| Privacy policy | `https://cep.logback-backend-services.online/privacy` |

The same list appears under Settings > Callback URLs (click a row to copy).

Suggested order of work: WhatsApp > Instagram > Gmail > Shopify.

---

## 1. Open Settings

1. Sign in at `https://cep.logback-backend-services.online`.
2. Open **Settings** in the left navigation.
3. Use the **Channels** tab for WhatsApp, Instagram, and Gmail.
4. Use the **Shopify** tab for store API credentials.

---

## 2. WhatsApp

### Fields in Settings > WhatsApp

| Field | Meaning |
|-------|---------|
| Phone Number ID | Cloud API id of the business number (numeric id from Meta, not `+91…`) |
| Access Token | Bearer token used for Graph API send/receive |
| Verify Token | Shared secret you choose; must match the Meta webhook config |
| App Secret | Meta app secret (same page as App ID; see 2.4) |
| Business Account ID | WhatsApp Business Account (WABA) id |

Save the WhatsApp card in CEP after filling the fields. Save **before** clicking Verify on Meta’s webhook form so verification can succeed.

### 2.1 Meta app and WhatsApp product

1. Open https://developers.facebook.com/apps/
2. Create an app (Business) or select an existing one.
3. Add the **WhatsApp** product.
4. Open **WhatsApp > API Setup**  
   `https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/wa-dev-console/`

### 2.2 Phone Number ID

1. On API Setup, locate the connected business phone number.
2. Copy **Phone number ID**.
3. Paste into CEP > Phone Number ID.

### 2.3 Business Account ID

1. On API Setup, copy **WhatsApp Business Account ID**, or find it in WhatsApp Manager for that WABA.
2. Paste into CEP > Business Account ID.

### 2.4 App ID and App Secret

These values live on Meta’s **App settings > Basic** page (not under WhatsApp API Setup).

1. Open your app in https://developers.facebook.com/apps/
2. In the left sidebar: **App settings > Basic**  
   Direct URL: `https://developers.facebook.com/apps/{APP_ID}/settings/basic/`
3. Copy **App ID** (visible on that page; also shown in the top app toolbar).
4. Next to **App secret**, click **Show**, confirm your password, then copy the secret.
5. Paste **App Secret** into CEP > App Secret.

Paste **App Secret** into CEP WhatsApp settings. (Instagram uses a different App ID/Secret pair — see section 3.)

Meta reference: App Dashboard / Basic settings  
https://developers.facebook.com/docs/development/create-an-app/app-dashboard/

### 2.5 Verify Token

1. Choose a string without spaces (example format: `cep-wa-verify-<brand>`).
2. Enter it in CEP > Verify Token and Save.
3. Enter the same string again when configuring the Meta webhook (section 2.7).

### 2.6 Access Token (System User)

Tokens shown on API Setup usually expire within about 24 hours. For ongoing use, generate a System User token.

1. Open Business Settings: https://business.facebook.com/latest/settings  
   Select the correct business. You need Admin access.
2. Go to **Users > System users > Add**.
3. Name the user (for example `CEP WhatsApp`), role **Admin**, create it.
4. Select the user > **Assign assets**:
   - Apps: select your Meta app > Full control / Manage app.
   - WhatsApp accounts: select the WABA > Full control / Manage WhatsApp Business accounts.
   - Confirm assign.
5. **Generate token**:
   - Select the same Meta app.
   - Include at least: `whatsapp_business_messaging`, `whatsapp_business_management`, and `business_management` if listed.
   - Prefer non-expiring if Meta offers it; otherwise take the longest expiry available.
6. Copy the token when shown (often only once).
7. Paste into CEP > Access Token > Save.

Reference: Meta “Get started”, step on system user tokens:  
https://developers.facebook.com/docs/whatsapp/business-management-api/get-started

### 2.7 WhatsApp webhook

1. In the Meta app open Webhooks or WhatsApp > Configuration:  
   `https://developers.facebook.com/apps/{APP_ID}/webhooks/`
2. Callback URL:  
   `https://cep.logback-backend-services.online/webhooks/whatsapp`
3. Verify token: same value as CEP Verify Token.
4. Verify and save.
5. Subscribe to **messages**.

### 2.8 Smoke test

1. Send a WhatsApp message to the connected business number from a customer handset.
2. Confirm the thread in CEP Inbox (WhatsApp) and send a reply within the messaging window.

---

## 3. Instagram

CEP uses **Business Login for Instagram** via **Connect Instagram**. After connect, Access Token and Username are stored automatically. You do **not** enter a Page ID.

Important: Instagram App ID and Instagram App Secret are **not** the Meta App ID / App Secret from **App settings > Basic**. They are a separate pair shown on the Instagram product page (see 3.1).

### Fields in Settings > Instagram

| Field | Source |
|-------|--------|
| Instagram App ID | **Instagram app ID** from Instagram > API setup with Instagram login |
| Instagram App Secret | **Instagram app secret** from the same Instagram setup page |
| Verify Token | Chosen by you (may differ from WhatsApp) |
| Access Token | Set by **Connect Instagram** (do not invent one) |
| Username | Set by **Connect Instagram** |

Requirements: Instagram account must be Professional (Business or Creator). Instagram product enabled on the Meta app.

Useful docs:

- https://developers.facebook.com/docs/instagram-platform/overview (Instagram app ID vs Meta app ID)  
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/  
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-instagram  

### 3.1 Instagram App ID and App Secret

1. Open your Meta app: https://developers.facebook.com/apps/
2. Left sidebar: **Instagram > API setup with Instagram login**  
   (Meta may label this **API setup with Instagram business login**.)
3. At the top of that page, copy:
   - **Instagram app ID** → CEP Settings > Instagram > Instagram App ID  
   - **Instagram app secret** → CEP Settings > Instagram > Instagram App Secret  
     (Use Copy / Show on that page; do not use App secret from App settings > Basic.)
4. Enter a Verify Token of your choosing.
5. Save the Instagram card in CEP **before** clicking Connect Instagram.

Do not paste the global Meta App ID from the top toolbar (or App settings > Basic) into Instagram Settings. That ID is for Facebook Login / other products; Connect Instagram will fail or misbehave if you mix them.

Meta reference: apps using Business Login for Instagram must use the Instagram app ID from this dashboard section:  
https://developers.facebook.com/docs/instagram-platform/overview

### 3.2 OAuth redirect in Meta

1. Still under Instagram > API setup with Instagram login, open **Set up Instagram business login** (Business login settings).
2. Add OAuth redirect URI:  
   `https://cep.logback-backend-services.online/oauth/instagram/callback`
3. Save in Meta.

If Meta requests additional URLs:

| Field | URL |
|-------|-----|
| Deauthorize | `https://cep.logback-backend-services.online/oauth/instagram/deauthorize` |
| Data deletion | `https://cep.logback-backend-services.online/oauth/instagram/data-deletion` |
| Privacy | `https://cep.logback-backend-services.online/privacy` |

### 3.3 Connect Instagram

1. In CEP Settings > Instagram, click **Connect Instagram**.
2. Approve access as the business Instagram account that should receive DMs.
3. Return to Settings and confirm success. Access Token and Username are filled automatically.

### 3.4 Instagram webhook

1. Open Meta Webhooks (and Messenger > Instagram if that is where Instagram messaging is configured).
2. Callback URL:  
   `https://cep.logback-backend-services.online/webhooks/instagram`
3. Verify token: Instagram Verify Token from CEP.
4. Verify and save; subscribe to **messages**.

### 3.5 Smoke test

1. From a customer Instagram account, send a text DM to the connected business account.
2. Confirm the thread in CEP Inbox > Instagram and send a reply.

---

## 4. Gmail

### Fields in Settings > Email

| Field | Source |
|-------|--------|
| Client ID | Google Cloud OAuth web client |
| Client Secret | Same client |
| Pub/Sub Topic | `projects/{PROJECT_ID}/topics/{TOPIC}` |
| Refresh / Access Token | Set by **Connect Gmail** |

### 4.1 Project and APIs

1. Open https://console.cloud.google.com/ and select a project.
2. Enable Gmail API:  
   https://console.cloud.google.com/apis/library/gmail.googleapis.com  
3. Enable Pub/Sub API:  
   https://console.cloud.google.com/apis/library/pubsub.googleapis.com  

### 4.2 OAuth consent screen

1. https://console.cloud.google.com/apis/credentials/consent  
2. Configure External (typical) app details.
3. Add scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
4. Publish the app (or, until it is published, add the support mailbox under Test users so Connect Gmail can complete).

### 4.3 OAuth client

1. https://console.cloud.google.com/apis/credentials  
2. Create credentials > OAuth client ID > Web application.
3. Authorized redirect URI:  
   `https://cep.logback-backend-services.online/oauth/gmail/callback`
4. Copy Client ID and Client Secret into CEP and Save.

### 4.4 Connect Gmail

1. Click **Connect Gmail**.
2. Sign in as the support mailbox and approve scopes.
3. Confirm return to Settings.

If no refresh token is issued, revoke the app under https://myaccount.google.com/permissions and connect again.

### 4.5 Pub/Sub

1. Topics: https://console.cloud.google.com/cloudpubsub/topic/list  
2. Create a topic (for example `gmail-events`).
3. Topic permissions: grant **Pub/Sub Publisher** to  
   `gmail-api-push@system.gserviceaccount.com`
4. Create a push subscription:
   - Endpoint: `https://cep.logback-backend-services.online/webhooks/email/pubsub`
   - Authentication off; payload unwrapping off (unless your ops standard differs)
5. Put the full topic name into CEP > Pub/Sub Topic > Save.

### 4.6 Watch

Google's Gmail push watch is **not permanent**. You must call `users.watch` at least every **7 days** or push notifications stop. Maximum expiry is about **7 days** (Google API limit; CEP cannot make it forever).

1. Click **Start Gmail watch** in Settings (runs `users.watch`).
2. Send a test message to the connected mailbox.
3. Confirm CEP Inbox > Email.

CEP also renews the watch when the API container restarts. If the API stays up longer than a week without a restart, click **Start Gmail watch** again before expiry, or new mail push may stop silently.

---

## 5. Shopify

Shopify access is read-only. CEP does not create or update Shopify customers or orders. Lookups support the Inbox customer panel and inbound contact linking for WhatsApp/Email.

### Fields in Settings > Shopify

| Field | Value |
|-------|--------|
| Shop subdomain | Subdomain only (`yourbrand` from `yourbrand.myshopify.com`) |
| Client ID | App client id |
| Client Secret | App client secret |

Required Admin API scopes (minimum): `read_customers`, `read_orders`.

1. Create or open the app in the Shopify Dev / Partner dashboard.
2. Install it on the store with the scopes above.
3. Enter subdomain, Client ID, and Client Secret in CEP > Shopify > Save.

Inbound linking behaviour:

- WhatsApp message: search Shopify by phone, use returned email to match an existing CEP contact when possible.
- Email message: search by email, use returned phone the same way.
- Instagram: no Shopify lookup.

---

## 6. Keeping channels online

Providers rotate or expire some credentials. Use this as the ops checklist after go-live.

### WhatsApp

| Item | What happens | What you do |
|------|----------------|-------------|
| Access Token from API Setup (temporary) | Often dies in about **24 hours** | Do not rely on this in production |
| System User access token | Can be set not to expire, or with a long expiry | Create and paste this into Settings (section 2.6). Prefer non-expiring when Meta offers it |
| App Secret / Phone Number ID / Verify Token | Stable until you rotate them | Update Settings if you reset secrets in Meta |

If outbound WhatsApp suddenly fails after a day of working, the usual cause is still using a temporary API Setup token. Replace it with a System User token.

### Instagram

| Item | What happens | What you do |
|------|----------------|-------------|
| Access Token from **Connect Instagram** | Starts short-lived; CEP exchanges it for a long-lived token (about **60 days**) | Before it lapses, click **Connect Instagram** again (or after Meta revokes the app) |
| Instagram App ID / App Secret | Stable until you reset them in Meta | Re-enter in Settings if you click Reset on the Meta Instagram setup page |
| Verify Token | You chose it | Change only if you also update the Meta webhook |

Instagram tokens are not permanent like a WhatsApp System User token. Plan a reconnect every couple of months, or sooner if DMs stop sending.

### Gmail

| Item | What happens | What you do |
|------|----------------|-------------|
| Access Token | Expires in about **1 hour** | Nothing day to day — CEP refreshes it using the refresh token |
| Refresh Token | Long-lived; not on a fixed clock | Click **Connect Gmail** again if Google revoked access (password change, app removed under Google Account permissions, long unused, or consent reset) |
| Gmail `users.watch` (push) | Max about **7 days**. Google requires calling watch again or push stops | Click **Start Gmail watch** in Settings before expiry. CEP also renews watch when the API restarts |

Access Token and Refresh Token are not the same as the 7-day watch. Short-lived access tokens are normal. Missing new mail with no errors often means the watch expired — renew it.

### Quick ops rhythm

- WhatsApp: confirm a System User token once; revisit only if Meta rotates it or send starts failing.
- Instagram: reconnect before ~60 days, or when Connect / send errors appear.
- Gmail: rely on refresh token for API calls; renew **Start Gmail watch** at least weekly if the server is not restarted often.

---

## 7. Verification

| Step | WhatsApp | Instagram | Gmail | Shopify |
|------|----------|-----------|-------|---------|
| Credentials in Settings | Saved | Saved + Connect | Saved + Connect + Topic | Saved |
| Provider config | Webhook verified, `messages` subscribed | Webhook + OAuth redirect | Redirect URI + push subscription + watch | App installed with read scopes |
| Functional check | Inbound + reply | Customer DM + reply | Inbound email + reply | Customer panel shows orders for a matched contact |

---

## 8. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Webhook verification failed | Callback URL or Verify Token does not match CEP; API unreachable |
| WhatsApp stops after ~24h | Temporary API Setup token; replace with System User token |
| Send fails, receive works | Token/scopes/Phone Number ID |
| Instagram Connect error | Redirect URI mismatch, or Instagram App ID/Secret (from Instagram API setup page) not saved before Connect; used Meta App ID from Basic by mistake |
| IG DMs not arriving | Webhook URL/token mismatch, or `messages` not subscribed |
| Instagram send fails after weeks | Long-lived token expired; Connect Instagram again |
| Gmail `redirect_uri_mismatch` | Client missing the hosted Gmail callback URL |
| Gmail `access_denied` | Consent screen not published / mailbox not allowed |
| New Gmail stops arriving after ~7 days | `users.watch` expired; click Start Gmail watch |
| Gmail Connect required again | Refresh token revoked (password change, app removed, unused too long) |
| Gmail watch errors | Topic missing Publisher for `gmail-api-push@system.gserviceaccount.com` |
| Empty Shopify panel | Wrong shop, missing scopes, or email/phone mismatch with Shopify customer |

---

## URL reference

```
https://cep.logback-backend-services.online
https://cep.logback-backend-services.online/webhooks/whatsapp
https://cep.logback-backend-services.online/webhooks/instagram
https://cep.logback-backend-services.online/webhooks/email/pubsub
https://cep.logback-backend-services.online/oauth/gmail/callback
https://cep.logback-backend-services.online/oauth/instagram/callback
https://cep.logback-backend-services.online/privacy
```
