# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM node:24-alpine AS production
WORKDIR /app
RUN corepack enable \
  && addgroup -g 1001 -S appgroup \
  && adduser -S appuser -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appgroup package.json ./
COPY --chown=appuser:appgroup src ./src
USER appuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/app.ts"]
