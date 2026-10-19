# Multi-stage productiebuild voor de centrale narrowcasting-server.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.server.json ./
COPY public ./public
COPY src ./src
COPY server ./server

RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    APP_ROOT=/app \
    DATA_DIR=/app/data

RUN useradd --system --create-home --uid 10001 appuser \
  && mkdir -p /app/data \
  && chown -R appuser:appuser /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && chown -R appuser:appuser /app/node_modules

COPY --from=build --chown=appuser:appuser /app/dist ./dist

USER appuser
EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
