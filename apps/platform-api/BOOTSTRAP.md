# Platform API — database bootstrap

## One-command bootstrap (fresh or outdated DB)

From `apps/platform-api`:

```bash
npm run bootstrap
```

This runs:

1. `db:deploy` → `src/scripts/migrate.ts` (SQL-only: init / legacy repair / baseline — never hangs on `prisma migrate deploy`)
2. `seed` → creates Account + WhatsApp / Instagram / Email / Gmail inboxes from `.env`

Then start the API:

```bash
npm run dev
# or Docker:
cd ../ && docker compose up -d --build platform-api
```

## Docker

`platform-api` runs SQL migrate/repair inside `server.ts` before listen:

```text
node dist/server.js
```

## Connection strings

- `PLATFORM_DATABASE_URL` — app runtime (pooler `:6543` OK)
- `PLATFORM_MIGRATE_DATABASE_URL` — migrations (prefer session/direct `:5432` if pooler hangs)
- Encode `@` in passwords as `%40`

## Verify

```bash
curl http://localhost:4100/health
curl "http://localhost:4100/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=ok"
```

Meta callbacks must hit a **public HTTPS** URL (ngrok/cloudflared), not `localhost`.

## Full vendor channel guide (WhatsApp / Instagram / Gmail)

See **[docs/CHANNEL_SETUP_GUIDE.md](../../docs/CHANNEL_SETUP_GUIDE.md)** for:

- High-level send/receive for all 3 adapters
- Every credential and console link
- Development test users / Instagram Testers / WA allow-list / Google OAuth test users
- Pub/Sub, webhooks, seed, and troubleshooting
