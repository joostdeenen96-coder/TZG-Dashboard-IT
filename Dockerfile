# Multi-stage productiebuild voor de centrale narrowcasting-server.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY public ./public
COPY src ./src
COPY server ./server

ARG APP_VERSION=0.4.1
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE
ENV APP_VERSION=$APP_VERSION \
    BUILD_COMMIT=$BUILD_COMMIT \
    BUILD_DATE=$BUILD_DATE

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ARG APP_VERSION=0.4.1
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE
ENV NODE_ENV=production \
    PORT=8080 \
    APP_ROOT=/app \
    DATA_DIR=/app/data \
    APP_VERSION=$APP_VERSION \
    BUILD_COMMIT=$BUILD_COMMIT \
    BUILD_DATE=$BUILD_DATE \
    BACKUP_DIRECTORY=/backups

RUN useradd --system --create-home --uid 10001 appuser \
  && mkdir -p /app/data /backups \
  && chown -R appuser:appuser /app /backups \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && chown -R appuser:appuser /app/node_modules

COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --from=build --chown=appuser:appuser /app/server/db/migrations /app/server/db/migrations
COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh

# Start as root zodat entrypoint data-volume ownership kan herstellen, daarna drop naar appuser.
USER root
EXPOSE 8080
VOLUME ["/app/data", "/backups"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
