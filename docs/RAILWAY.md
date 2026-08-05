# Deploy CEP on Railway

## Services

1. **Postgres** — Railway Postgres. Use its `DATABASE_URL` as `PLATFORM_DATABASE_URL`.
2. **platform-api** — Deploy from this repo  
   - Dockerfile: `Dockerfile.platform-api`  
   - Variables:
     - `PLATFORM_DATABASE_URL` = Railway Postgres URL  
     - `PLATFORM_PORT=4100`  
     - `PLATFORM_ADMIN_TOKEN` = strong secret  
     - `PLATFORM_PUBLIC_BASE_URL` = public HTTPS URL of this service  
   - Public networking: target port `4100`

## After first deploy

```bash
pnpm db:deploy
pnpm seed
```

Point Meta / email webhooks at:

`https://<public-domain>/webhooks/{whatsapp|instagram|email}/{inboxId}`
