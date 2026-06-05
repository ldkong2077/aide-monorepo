# syntax=docker/dockerfile:1.7

# ─── Stage 1: build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install all deps (dev included) for the build step.
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
COPY packages/ ./packages/
RUN npm ci --ignore-scripts \
 && npm run build \
 && npm prune --omit=dev --workspaces --include-workspace-root

# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

# The official `node:20-alpine` image ships a non-root `node` user (uid 1000).
# We drop privileges to it instead of running the server as root.
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages

USER node
EXPOSE 9900

# Liveness probe — the process is alive if `/health` returns 200.
# Readiness is also covered by `/readyz` (503 while starting / shutting down).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:9900/health || exit 1

# Honour LOG_FORMAT=json and LOG_LEVEL=debug at runtime via env.
CMD ["node", "packages/cli/dist/bin.js", "router", "start", "--port", "9900"]
