FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/app/data CHROMIUM_PATH=/usr/bin/chromium HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/supabase-data-sync.mjs restore --only=db; node scripts/supabase-data-sync.mjs restore --only=media & node server.js"]
