# CEP Platform — Architecture

Customer Engagement Platform (CEP) is an omnichannel agent inbox for **WhatsApp Cloud API**, **Instagram Messaging**, and **Gmail**. Stack: Fastify + Prisma API, React agent UI, PostgreSQL.

Vendor-facing credential steps live in [`CHANNEL_SETUP_GUIDE.md`](./CHANNEL_SETUP_GUIDE.md).

---

## 1. System map

```text
┌─────────────────┐     HTTPS REST      ┌──────────────────────┐
│  platform-web   │ ◄─────────────────► │   platform-api       │
│  (agent UI)     │   JWT Bearer auth   │   Fastify + Prisma   │
└─────────────────┘                     └──────────┬───────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────────┐
                    ▼                              ▼                              ▼
            WhatsApp Graph                 Instagram Graph                   Gmail API
            + Meta webhooks                + Meta webhooks                   + Pub/Sub push
```

| App | Path | Role |
|-----|------|------|
| API | `apps/platform-api` | Auth, accounts, inboxes, contacts, conversations, messages, webhooks, OAuth |
| Web | `apps/platform-web` | Login, Inbox, Contacts, Dashboard, **Settings (channel setup)** |

Public hosting:

| Surface | Host |
|---------|------|
| Agent UI | `https://cep.logback-backend-services.online` |
| API + webhooks + OAuth callbacks | `https://cep-api.logback-backend-services.online` |

Env (set in `apps/platform-api/.env` — not hardcoded in source):

```env
PLATFORM_PUBLIC_BASE_URL="https://cep-api.logback-backend-services.online"
PLATFORM_WEB_BASE_URL="https://cep.logback-backend-services.online"
```

- `PLATFORM_PUBLIC_BASE_URL` — API origin (webhooks, OAuth callbacks)  
- `PLATFORM_WEB_BASE_URL` — agent UI origin (OAuth Connect returns here → `/settings`)  
- Web `VITE_API_BASE_URL` — must point at the API origin  

---

## 2. Domain model

Chatwoot-style hierarchy, one conversation **per channel** per contact:

```text
Account
  └── Inbox (whatsapp | instagram | email)
        └── Conversation (status: open | pending | resolved)
              └── Message (incoming | outgoing)

Contact
  ├── emails[] / email / emailId
  ├── whatsappIds[] / whatsappId
  └── instagramId
```

Important behaviours:

| Concern | Behaviour |
|---------|-----------|
| Contact match | Inbound looks up **any** stored id for that channel (`whatsappIds`, `emails`, primary fields). Soft-merge across channels when email/WA overlap. Else create contact. |
| Status | Stored on **Conversation** (per channel), never on Contact. UI “Active” = any channel open/pending. |
| Channel config | Per-inbox `channelConfig` JSON. Settings UI merges patches; secrets redacted as `***` on read. Env defaults fill empty fields via `resolveChannelConfig`. |
| Outbound | Always on the **same inbox/channel** as the open conversation. |

---

## 3. Request & message flows

### 3.1 Inbound (receive)

```text
Customer → Provider → POST /webhooks/{channel}
                   → resolve first enabled inbox for that channel
                   → normalize adapter payload
                   → findOrCreateContact
                   → findOrCreateConversation
                   → persist Message
                   → Agent UI polls GET /conversations + /messages
```

| Channel | Webhook (stable, no inbox id) |
|---------|-------------------------------|
| WhatsApp | `POST /webhooks/whatsapp` |
| Instagram | `POST /webhooks/instagram` |
| Gmail | Pub/Sub push → `POST /webhooks/email/pubsub` |

Examples (hosted):

```text
https://cep-api.logback-backend-services.online/webhooks/whatsapp
https://cep-api.logback-backend-services.online/webhooks/instagram
https://cep-api.logback-backend-services.online/webhooks/email/pubsub
```

There are **no** `/webhooks/whatsapp/:inboxId` or `/webhooks/instagram/:inboxId` routes. Meta callbacks use the channel-only URLs above; the API routes traffic to the first enabled inbox for that channel.

Meta **GET** verify uses `hub.verify_token` matched against inbox/env `verifyToken`.

### 3.2 Outbound (send)

```text
Agent UI → POST /api/v1/conversations/:id/messages
        → MessagingService → channel adapter
        → Graph / Gmail send API
        → Message status sent | failed
```

### 3.3 Vendor OAuth (no CLI)

Developers historically ran `npm run gmail:oauth` / `npm run instagram:oauth` on localhost. **Vendors only have the hosted UI**, so OAuth is browser-native:

```text
Settings → Save App / Client credentials
        → Connect Gmail | Connect Instagram
        → POST /api/v1/oauth/{gmail|instagram}/start   (JWT)
        → Redirect to Google / Meta consent
        → GET /oauth/{gmail|instagram}/callback          (public)
        → Exchange code → write tokens into inbox.channelConfig
        → Redirect → PLATFORM_WEB_BASE_URL/settings?oauth=…&status=success
```

After a successful Connect, the browser lands on:

```text
https://cep.logback-backend-services.online/settings?oauth=gmail|instagram&status=success
```

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/v1/oauth/hints` | JWT | Redirect URIs + webhook bases to paste in consoles |
| `POST /api/v1/oauth/gmail/start` | JWT | Returns Google consent URL |
| `POST /api/v1/oauth/instagram/start` | JWT | Returns Instagram consent URL |
| `GET /oauth/gmail/callback` | Public | Code exchange → save refresh/access tokens |
| `GET /oauth/instagram/callback` | Public | Code exchange → save long-lived token + subscribe apps |

Signed JWT `state` binds the callback to the correct inbox (20 min TTL).

CLI scripts remain for engineers debugging locally; they are **not** required for vendor setup.

---

## 4. API surface (high level)

| Area | Paths |
|------|--------|
| Health | `GET /health` |
| Auth | `POST /api/v1/auth/login` |
| Accounts / inboxes | `/api/v1/accounts…`, `PATCH /api/v1/inboxes/:id` |
| Conversations / messages | `/api/v1/conversations…` |
| Contacts | `/api/v1/contacts…` |
| Dashboard | `/api/v1/dashboard…` |
| Gmail watch | `POST /api/v1/gmail/watch`, `POST /api/v1/gmail/renew-watch` |
| OAuth connect | `/api/v1/oauth…`, `/oauth…` |
| Webhooks | `GET/POST /webhooks/whatsapp`, `GET/POST /webhooks/instagram`, `POST /webhooks/email/pubsub` |

All `/api/v1/*` except auth require `Authorization: Bearer <jwt>`. Webhooks and `/oauth/*` callbacks stay public.

---

## 5. Channel adapters

Located under `apps/platform-api/src/adapters/`:

| Adapter | Send | Receive |
|---------|------|---------|
| `whatsapp` | Graph `/{phoneNumberId}/messages` | Meta webhook `messages` |
| `instagram` | Instagram Graph `me/messages` (or Page path) | Meta webhook `messages` |
| `email` | Gmail API `users.messages.send` | Pub/Sub → History → `messages.get` |

Shared types: `NormalizedInboundMessage`, per-channel config interfaces in `adapters/shared/types.ts`.

---

## 6. Frontend structure

| Route | Page |
|-------|------|
| `/login` | Admin login |
| `/inbox` | Omnichannel thread UI (list + channel tabs + customer panel) |
| `/contacts` | Contact directory (multi email / WhatsApp) |
| `/dashboard` | Lightweight metrics |
| `/settings` | Channel credentials, webhook/OAuth URLs, **Connect** + Gmail watch |

API client: `apps/platform-web/src/api/index.ts` (React Query + Zustand auth token).

---

## 7. Data & ops

| Concern | Notes |
|---------|--------|
| Schema | `apps/platform-api/prisma/schema.prisma` |
| Migrations | `npm run db:deploy` (`src/scripts/migrate.ts`) |
| Seed | `npm run seed` — ensures account + 3 channel inboxes from env |
| Docker | `apps/docker-compose.yml` — API + web (and optional deps) |
| Bootstrap | See `apps/platform-api/BOOTSTRAP.md` |

Secrets:

- Prefer inbox `channelConfig` from Settings for multi-tenant vendor credentials.  
- Server `.env` supplies platform defaults and Meta/Google **app** secrets when inbox fields are empty.

---

## 8. Security notes

- JWT secret: `JWT_SECRET`.  
- Channel secrets redacted in API responses (`***`); merge ignores `***` patches so accidental save does not wipe tokens.  
- OAuth `state` is HMAC/JWT-signed; callbacks without valid state cannot target an arbitrary inbox when state is required (Gmail always; Instagram prefers state from Settings Connect).  
- Webhook signature verification can use App Secret fields (channel-dependent hardening).

---

## 9. Local vs hosted

| Mode | Public URL | OAuth |
|------|------------|--------|
| Local eng | Tunnel (`cloudflared` / ngrok) → `PLATFORM_PUBLIC_BASE_URL` | Settings Connect **or** CLI scripts |
| Hosted vendor | `cep-api…` API + `cep…` UI | **Settings Connect only** (recommended) |

Meta and Google **cannot** call `localhost`. Always point webhooks and OAuth redirects at the public API host.

---

## Related

- Step-by-step credentials: [`CHANNEL_SETUP_GUIDE.md`](./CHANNEL_SETUP_GUIDE.md)  
- Env template: [`apps/platform-api/.env.example`](../apps/platform-api/.env.example)  
- Privacy HTML: [`docs/privacy-policy.html`](./privacy-policy.html)
