FROM node:22-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @tixing/shared build \
 && pnpm --filter @tixing/db build \
 && pnpm --filter @tixing/core build

FROM deps AS api
RUN pnpm --filter @tixing/api build
EXPOSE 3000
CMD ["pnpm", "--filter", "@tixing/api", "start"]

FROM deps AS worker
RUN pnpm --filter @tixing/worker build
CMD ["pnpm", "--filter", "@tixing/worker", "start"]

FROM deps AS web-build
RUN pnpm --filter @tixing/web build

FROM nginx:1.27-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80

FROM deps AS migrate
CMD ["pnpm", "--filter", "@tixing/db", "migrate:deploy"]
