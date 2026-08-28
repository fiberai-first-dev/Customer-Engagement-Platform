FROM node:20-alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Client API setup (for generated Prisma client)
WORKDIR /app/client/platform-api
COPY client/platform-api/package*.json ./
RUN npm install
COPY client/platform-api/prisma ./prisma
RUN npx prisma generate
COPY client/platform-api/ ./

# Admin API setup
WORKDIR /app/admin/platform-admin-api
COPY admin/platform-admin-api/package*.json ./
RUN npm install
COPY admin/platform-admin-api/prisma ./prisma
RUN npx prisma generate
COPY admin/platform-admin-api/ ./

EXPOSE 4200
CMD ["sh", "-c", "npm run db:deploy && npx tsx src/server.ts"]
