# syntax=docker/dockerfile:1
FROM node:24-alpine AS pruner
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm dlx turbo prune @pizza/api --docker

FROM node:24-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS dev
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo ./
COPY --from=pruner /repo/out/full/ .
COPY --from=pruner /repo/tsconfig.base.json ./tsconfig.base.json
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["pnpm", "run", "dev:docker"]

FROM node:24-alpine AS production
WORKDIR /repo
RUN corepack enable \
  && addgroup -g 1001 -S appgroup \
  && adduser -S appuser -u 1001
COPY --from=deps /repo ./
COPY --from=pruner --chown=appuser:appgroup /repo/out/full/ .
COPY --from=pruner --chown=appuser:appgroup /repo/tsconfig.base.json ./tsconfig.base.json
USER appuser
WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "run", "start:docker"]
