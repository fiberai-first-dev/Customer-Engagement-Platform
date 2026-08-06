# Channel Setup Guide

This guide tells you how to connect **WhatsApp**, **Instagram**, and **Gmail** to CEP.

You only use the website. You do **not** need coding, Docker, or the terminal.

---

## The two links you need

| Name | Link | What it is |
|------|------|------------|
| Website | https://cep.logback-backend-services.online | Login, Inbox, **Settings** |
| API | https://cep-api.logback-backend-services.online | Used by Meta / Google behind the scenes (webhooks). You will copy this from Settings. |

---

## Start here (every channel)

1. Open the website: [https://cep.logback-backend-services.online](https://cep.logback-backend-services.online)
2. Log in with the username and password you were given.
3. Click **Settings** on the left side.
4. At the top you will see **Webhook & OAuth URLs**.  
   Click a URL once to **copy** it. Paste it later when Meta or Google asks.

**How Settings works**

- Type values into the boxes.
- Click **Save** for that channel.
- If a box shows `***`, a secret is already saved. To change it: clear the box → paste the new value → Save.
- For Instagram and Gmail, after you save IDs/secrets, click **Connect** (a browser popup asks you to allow access).

Do WhatsApp first, then Instagram, then Gmail.

---

# Part 1 — WhatsApp

### 1. Open Meta

1. Go to [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
2. Sign in.
3. Click **Create App** (or open your app if you already have one).
4. Choose **Business**.
5. Add the product **WhatsApp** if it is not there yet.

### 2. Copy numbers from Meta into CEP

1. In Meta open **WhatsApp → API Setup**.
2. Open CEP → **Settings → WhatsApp**.
3. Copy and paste like this:

| Copy from Meta | Paste into CEP |
|----------------|----------------|
| Phone number ID | Phone Number ID |
| Access token | Access Token |
| WhatsApp Business Account ID | Business Account ID |

4. Still in Meta, open **App settings → Basic**.
5. Click to show **App Secret** → paste into CEP **App Secret**.
6. Think of any password-like word (example: `cep-wa-verify`) → type it into CEP **Verify Token**.  
   Remember this word. You will type the same word in Meta in the next step.
7. Click **Save WhatsApp**.

> Tip: Meta’s temporary Access Token dies in about 1 day. If WhatsApp stop sending later, get a new Access Token and Save again.

### 3. Tell Meta where to send messages

1. In Meta open **WhatsApp → Configuration** (or App → Webhooks).
2. Click **Edit** on the webhook.
3. Paste:

| Meta asks for | Put this |
|---------------|----------|
| Callback URL | Click copy **WhatsApp webhook** in CEP Settings  
(it looks like `https://cep-api.logback-backend-services.online/webhooks/whatsapp`) |
| Verify token | The same word you put in CEP **Verify Token** |

4. Click **Verify and save**.
5. Subscribe to **messages** (turn it on).

### 4. Test WhatsApp

1. In Meta **API Setup**, under **To**, add your personal phone number and finish the SMS check.
2. From that phone, WhatsApp the business / test number shown in Meta.
3. Open CEP → **Inbox**. Your chat should appear.
4. Type a reply and Send. Your phone should get it.

✅ WhatsApp is done.

---

# Part 2 — Instagram

### 1. Before you start

- Your brand Instagram must be a **Professional** account (Business or Creator).
- You need a Meta app with the **Instagram** product (same app as WhatsApp is fine).

### 2. Save App ID and App Secret in CEP

1. In Meta open **App settings → Basic**:  
   [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/) → your app → Settings → Basic.
2. Copy **App ID** and **App Secret**.
3. In CEP → **Settings → Instagram**, paste:

| CEP box | What to type |
|---------|--------------|
| App ID | Meta App ID |
| App Secret | Meta App Secret |
| Verify Token | Any word you invent (example: `cep-ig-verify`) |
| Username | Your Instagram name (optional) |

4. Leave **Access Token** empty for now.
5. Click **Save Instagram**.

### 3. Allow CEP in Meta (redirect URI)

1. In Meta open your app → **Instagram** → Business login / API setup.
2. Find **OAuth redirect URIs**.
3. Add this **exact** line (or copy **Instagram OAuth redirect** from CEP Settings):

```text
https://cep-api.logback-backend-services.online/oauth/instagram/callback
```

4. Click Save in Meta.

### 4. Connect Instagram (get the token)

1. In CEP Settings → Instagram, click **Connect Instagram**.
2. Log in / allow access as the **business** Instagram account.
3. You return to Settings with a green success message.
4. The Access Token is saved (you may see `***`). That is normal.

### 5. Tell Meta where to send DMs

1. In Meta open **Webhooks**, or **Messenger → Instagram**.
2. Paste:

| Meta asks for | Put this |
|---------------|----------|
| Callback URL | Copy **Instagram webhook** from CEP Settings  
(`https://cep-api.logback-backend-services.online/webhooks/instagram`) |
| Verify token | Same as CEP Instagram **Verify Token** |

3. Verify and save.
4. Turn on / subscribe **messages**.

### 6. Test Instagram (Development mode)

While the Meta app is in Development, only testers work.

1. In Meta open **App roles → Roles**: add **Instagram Tester**.
2. Type the Instagram username of the friend who will send the test DM (no `@`).
3. That friend must **Accept** the invite inside Instagram.
4. Friend sends a new text DM to your business Instagram.
5. Open CEP → **Inbox** → Instagram tab.

✅ Instagram is done.

> If only “seen” shows but no text message appears, Meta may require the app to be **Live**. Ask your admin if that happens.

---

# Part 3 — Gmail

### 1. Create a Google Cloud project

1. Open [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create a new project (or pick one you already have).
3. Turn on these two APIs (search and click Enable):
   - [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
   - [Cloud Pub/Sub API](https://console.cloud.google.com/apis/library/pubsub.googleapis.com)

### 2. OAuth consent screen

1. Open [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. Choose **External** → Create.
3. Fill App name, your email → Save.
4. Add these scopes (permissions):
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
5. Under **Test users**, add the Gmail address that will receive customer email.  
   Example: `support@yourbrand.com`

### 3. Create Client ID and Client Secret

1. Open [Credentials](https://console.cloud.google.com/apis/credentials).
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, click Add and paste this **exact** line  
   (or copy **Gmail OAuth redirect** from CEP Settings):

```text
https://cep-api.logback-backend-services.online/oauth/gmail/callback
```

5. Click Create.
6. Copy **Client ID** and **Client Secret**. Keep them ready.

### 4. Create Pub/Sub topic (so new emails reach CEP)

1. Open [Pub/Sub topics](https://console.cloud.google.com/cloudpubsub/topic/list).
2. Click **Create topic**. Name it `gmail-events` → Create.
3. Open the topic → **Permissions** → Grant access:
   - New principal: `gmail-api-push@system.gserviceaccount.com`
   - Role: **Pub/Sub Publisher**
   - Save
4. Create a **Subscription** on that topic:
   - Delivery type: **Push**
   - Endpoint URL (or copy **Gmail Pub/Sub push** from CEP Settings):

```text
https://cep-api.logback-backend-services.online/webhooks/email/pubsub
```

   - Leave auth / unwrapping off unless Google asks for something else.
5. Copy the full topic name. It looks like:

```text
projects/YOUR_PROJECT_ID/topics/gmail-events
```

### 5. Save in CEP, then Connect

1. CEP → **Settings → Gmail / Email**.
2. Paste:

| CEP box | What to paste |
|---------|----------------|
| Client ID | From Google |
| Client Secret | From Google |
| Pub/Sub Topic | `projects/.../topics/gmail-events` |

3. Click **Save Gmail / Email**.
4. Click **Connect Gmail**.
5. Sign in as the support Gmail you added as Test user → Allow.
6. You return to Settings with a success message. Tokens show as `***`. That is normal.

### 6. Start watching the mailbox

1. Still on Gmail settings, click **Start Gmail watch**.
2. From any other email, send a mail to your support address.
3. Open CEP → **Inbox** → Email tab.
4. Reply once to test send.

✅ Gmail is done.

---

# Quick check — did it work?

| Channel | You should see… |
|---------|------------------|
| WhatsApp | Chat in Inbox after you message the business number |
| Instagram | DM in Inbox after a Tester messages you |
| Gmail | Email conversation after someone mails your support address |

Optional: open  
[https://cep-api.logback-backend-services.online/health](https://cep-api.logback-backend-services.online/health)  
You should see something like `"ok": true`.

---

# Something went wrong?

| You see… | Try this |
|----------|----------|
| Meta says webhook failed | Callback URL and Verify Token must match Settings exactly. Check for missing letters. |
| WhatsApp receive works, send fails | Paste a new Access Token → Save WhatsApp. |
| Connect Instagram fails | Save App ID + App Secret first. Check the OAuth redirect URI is exact. |
| Instagram DM never shows | Add Instagram Tester and accept the invite. Send a new text (not only open the chat). |
| Gmail says redirect_uri_mismatch | The Google redirect URI must be exactly  
`https://cep-api.logback-backend-services.online/oauth/gmail/callback` |
| Gmail says access_denied | Add that Gmail as an OAuth **Test user**. |
| Gmail watch fails | Pub/Sub topic must give **Publisher** to `gmail-api-push@system.gserviceaccount.com`. |
| Boxes show `***` after Connect | Good — the secret is saved and hidden. |

---

# Copy-paste list (API)

Use these only if Settings copy is not available:

| Purpose | URL |
|---------|-----|
| WhatsApp webhook | `https://cep-api.logback-backend-services.online/webhooks/whatsapp` |
| Instagram webhook | `https://cep-api.logback-backend-services.online/webhooks/instagram` |
| Instagram OAuth redirect | `https://cep-api.logback-backend-services.online/oauth/instagram/callback` |
| Gmail OAuth redirect | `https://cep-api.logback-backend-services.online/oauth/gmail/callback` |
| Gmail Pub/Sub push | `https://cep-api.logback-backend-services.online/webhooks/email/pubsub` |

Website (login / Settings): https://cep.logback-backend-services.online
