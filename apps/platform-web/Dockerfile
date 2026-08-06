FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:4100
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
RUN npm install -g serve
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
