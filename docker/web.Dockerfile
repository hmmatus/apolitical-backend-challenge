# syntax=docker/dockerfile:1
FROM node:24-alpine AS pruner
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm dlx turbo prune @pizza/web --docker

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
WORKDIR /repo/apps/web
EXPOSE 4321
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]

FROM deps AS build
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @pizza/web build

FROM nginx:alpine AS production
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
