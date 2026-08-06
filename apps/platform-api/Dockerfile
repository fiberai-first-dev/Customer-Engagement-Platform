FROM node:20-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate
RUN npm run build
RUN cp -r src/generated dist/

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
EXPOSE 4100
# server.ts runs SQL migrate/repair before listen (no prisma migrate deploy)
CMD ["node", "dist/server.js"]
