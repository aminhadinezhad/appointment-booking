# syntax=docker/dockerfile:1
#
# Multi-stage build:
#   deps     -> installs node_modules (cached unless package*.json changes)
#   builder  -> generates the Prisma client and builds Next.js (standalone output)
#   migrator -> one-off job: applies migrations and seeds the admin (used by compose)
#   dev      -> runs `next dev` for local trials (test OTP shown on screen)
#   runner   -> small production image that only contains the built app
#
# In Iran, Docker Hub may be blocked; pass a mirror prefix, e.g.
#   docker compose build --build-arg REGISTRY=docker.arvancloud.ir/
ARG REGISTRY=""
ARG NODE_IMAGE=node:22-alpine

FROM ${REGISTRY}${NODE_IMAGE} AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM builder AS migrator
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

FROM builder AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts --demo && npx next dev -H 0.0.0.0 -p 3000"]

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
