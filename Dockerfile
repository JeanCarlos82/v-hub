# --- build ---
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY apps apps
RUN pnpm build

# --- runtime ---
FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
RUN pnpm install --prod --frozen-lockfile --filter server && pnpm store prune
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

WORKDIR /app/apps/server
ENV NODE_ENV=production \
    PORT=4000 \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist \
    HOST_PROC=/host/proc \
    HOST_ROOT=/hostfs \
    NODE_NO_WARNINGS=1
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/index.js"]
