# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Build
FROM base AS builder
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build

# Production dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --production

# Run
FROM base AS runner
ENV NODE_ENV=production
USER bun

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/src ./src

EXPOSE 4000
CMD ["bun", "run", "start"]
