# Channel setup guide

Use **Settings** to connect WhatsApp, Instagram, Gmail, and Shopify. Create credentials in Meta, Google Cloud, or Shopify Admin, then enter them in this product.

**Callback URLs** live in Settings. Open **Settings → Callback URLs**, choose WhatsApp, Instagram, or Gmail, and copy. Paste those values into the provider console.

Recommended order: WhatsApp → Instagram → Gmail → Shopify.

---

## 1. Before you start

You need:

- Access to **Settings**
- A Meta developer app (WhatsApp and Instagram)
- A Google Cloud project you can administer (Gmail)
- Shopify Partner or store admin access (optional, for orders)

**Do not click Connect for Instagram or Gmail until the login redirect URL is saved in the provider console.** Copy it from Settings first, then save it in Meta or Google, then return here and connect.

---

## 2. WhatsApp

### Fields in Settings → Connect WhatsApp

| Field | Source |
|-------|--------|
| Phone Number ID | Meta → WhatsApp → API Setup |
| Access Token | System User token (see below). Do not use the short-lived token on API Setup. |
| Verify Token | You choose this value. Use the same string in the Meta webhook. |
| App Secret | Meta App settings → Basic |
| Business Account ID | WhatsApp Business Account ID (optional) |

### 2.1 Meta app

1. Open https://developers.facebook.com/apps/
2. Create a Business-type app, or open an existing app.
3. Add the **WhatsApp** product.

### 2.2 Phone Number ID and Business Account ID

1. Open WhatsApp → API Setup.
2. Copy **Phone number ID** into Settings.
3. Copy the WhatsApp Business Account ID if it is shown.

### 2.3 App Secret

1. Open App settings → Basic.
2. Copy **App Secret** into Settings.

Instagram uses a different App ID and App Secret. Do not reuse these values for Instagram.

### 2.4 Verify Token

1. Choose a string with no spaces.
2. Enter it in Settings → Verify Token.
3. Enter the same string when you configure the Meta webhook.

### 2.5 Access Token

Tokens on the API Setup page expire in about 24 hours. Create a System User token instead.

1. Open https://business.facebook.com/latest/settings
2. Users → System users → Add (Admin).
3. Assign assets: the Meta app (Full control) and the WhatsApp account.
4. Generate a token for that Meta app with:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management` (if listed)
5. Prefer a non-expiring token when Meta offers it.
6. Paste the token into Settings → Access Token.

### 2.6 Webhook

1. In the Meta app, open Webhooks or WhatsApp → Configuration.
2. Callback URL: copy **Webhook** from Settings → Callback URLs → WhatsApp.
3. Verify token: the same value as in Settings.
4. Verify and save.
5. Subscribe to **`messages`**.

If agents also reply from the WhatsApp Business app on the phone, the number must be onboarded with Meta Coexistence, and you should also subscribe to **`smb_message_echoes`**. A Cloud API–only number will not send phone replies to this product.

### 2.7 Connect

When the required fields are filled, click **Connect** in Settings.

Send a test message to the business number and confirm it appears in Inbox.

---

## 3. Instagram

You enter App ID, App Secret, and Verify Token only. Access Token and Username are filled after Instagram login. Do not paste a Page ID.

**Instagram App ID and Instagram App Secret are not the values from App settings → Basic.** Use the pair from Instagram → API setup with Instagram login.

### Fields in Settings → Connect Instagram

| Field | Who provides it |
|-------|-----------------|
| Instagram App ID | You, from Meta Instagram API setup |
| Instagram App Secret | You, from the same page |
| Verify Token | You choose this value |
| Access Token | Filled after Instagram login |
| Username | Filled after Instagram login |

### 3.1 Product and scopes

1. In the Meta app, add the **Instagram** product.
2. Open **Instagram → API setup with Instagram login**.
3. Copy **Instagram app ID** and **Instagram app secret** into Settings (do not click Connect yet).
4. After Connect, this product requests:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_manage_comments`
5. Complete Meta App Review for messaging permissions before production use.

### 3.2 Login redirect — save in Meta before Connect

Connect will fail if this URL is missing from the Meta app.

1. Open Settings → Callback URLs → Instagram and copy **Login redirect**.
2. Open https://developers.facebook.com/apps/ and select your app.
3. Go to **Instagram → API setup with Instagram login → Business login settings**.
4. Paste the copied value into **OAuth redirect URIs**.
5. Save in Meta.

### 3.3 Webhook

1. Open Meta Webhooks for Instagram messaging.
2. Callback URL: copy **Webhook** from Settings → Callback URLs → Instagram.
3. Verify token: the Instagram Verify Token from Settings.
4. Subscribe to **`messages`**.

### 3.4 Connect

Only after the login redirect is saved in Meta:

1. Settings → Instagram → **Connect**.
2. Enter Instagram App ID, Instagram App Secret, and Verify Token.
3. Click **Connect**. Instagram login opens.
4. Approve as the business Instagram account that should receive DMs.
5. You return to Settings with Instagram connected. Access Token and Username are stored for you.

Replies sent in the Instagram app appear here automatically. No extra echo setting is required.

Send a test DM from a customer account and confirm it in Inbox.

---

## 4. Gmail

You enter Client ID, Client Secret, and Pub/Sub Topic only. Refresh Token and Access Token are filled after Google login.

After Connect succeeds, mail watch starts automatically and is renewed in the background.

### Fields in Settings → Connect Gmail

| Field | Who provides it |
|-------|-----------------|
| Client ID | You, from the Google Cloud OAuth web client |
| Client Secret | You, from the same client |
| Pub/Sub Topic | You (`projects/{PROJECT_ID}/topics/{TOPIC}`) |
| Refresh Token | Filled after Google login |
| Access Token | Filled after Google login |

### 4.1 Enable APIs

Use a Google account that can administer the project.

1. Open https://console.cloud.google.com/ and select or create a project.
2. Enable **Gmail API**: https://console.cloud.google.com/apis/library/gmail.googleapis.com
3. Enable **Cloud Pub/Sub API**: https://console.cloud.google.com/apis/library/pubsub.googleapis.com

Both must show **Enabled**.

### 4.2 OAuth consent screen and scopes

1. Open https://console.cloud.google.com/apis/credentials/consent
2. Configure the app (External is typical) and a support email.
3. Add scopes:
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
4. Publish the app, or add the support mailbox under **Test users** until it is published.

### 4.3 Login redirect — save in Google before Connect

Connect will fail with a redirect mismatch if this URL is missing from the OAuth client.

1. Open Settings → Callback URLs → Gmail and copy **Login redirect**.
2. Open https://console.cloud.google.com/apis/credentials
3. Create credentials → OAuth client ID → **Web application**.
4. Under **Authorized redirect URIs**, paste the copied value and save.
5. Copy Client ID and Client Secret for Settings (do not click Connect yet).

### 4.4 Pub/Sub topic and push subscription

You need permission to create topics and edit topic IAM (Owner, or Pub/Sub Admin).

1. Open https://console.cloud.google.com/cloudpubsub/topic/list
2. Create a topic (for example `gmail-events`).
3. Open the topic → Permissions.
4. Grant **Pub/Sub Publisher** to `gmail-api-push@system.gserviceaccount.com` (Google’s Gmail push account, not your user).
5. Create a **Push** subscription on that topic.
6. Endpoint URL: copy **Push URL** from Settings → Callback URLs → Gmail.
7. Copy the topic name into Settings: `projects/{PROJECT_ID}/topics/{TOPIC}`

### 4.5 Connect

Only after the login redirect is saved on the Google OAuth client:

1. Settings → Gmail → **Connect**.
2. Enter Client ID, Client Secret, and Pub/Sub Topic.
3. Click **Connect**. Google login opens.
4. Sign in as the support mailbox and approve the scopes.
5. You return to Settings with Gmail connected. Mail watch starts on its own.

Send a test email to the mailbox and confirm it in Inbox.

Google’s push watch lasts up to seven days. This product renews it automatically while the API is running. Click **Connect** again only if Google revoked access.

---

## 5. Shopify

Connect Shopify to show customers and orders in the inbox.

### Fields in Settings → Shopify

| Field | Value |
|-------|--------|
| Shop subdomain | Subdomain only (`yourbrand` from `yourbrand.myshopify.com`) |
| Client ID | App client ID |
| Client Secret | App client secret |

### Scopes

Minimum:

- `read_customers`
- `read_orders`

1. Create or open the app in the Shopify Partner or Dev dashboard.
2. Install it on the store with those scopes.
3. Settings → Shopify → **Connect**.

WhatsApp and Email can match a Shopify customer by email or phone. Instagram cannot.
