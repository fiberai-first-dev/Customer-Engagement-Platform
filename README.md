# CEP — Customer Engagement Platform

Own messaging platform (Chatwoot as UX/architecture reference only).

## Stack

- `apps/platform-api` — Fastify + Prisma: accounts, inboxes, conversations, WhatsApp / Instagram / Email
- `apps/platform-web` — Chatwoot-like agent inbox UI
- `packages/channels` — channel adapters

## Quick start

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
- Auth: `Authorization: Bearer dev-token-change-me`  
- Postgres: `localhost:5434` (db `cep_platform`)

Channel setup (WhatsApp / Instagram / Email): **[docs/PLATFORM.md](docs/PLATFORM.md)**.
