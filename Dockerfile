FROM node:24-alpine AS build
WORKDIR /app
# The root lockfile owns both workspaces. Build tools are needed only here.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --ignore-scripts
COPY frontend ./frontend/
COPY shared ./shared/
COPY tsconfig.json ./
RUN npm run build:local -w frontend
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
RUN apk add --no-cache postgresql-client
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app/node_modules ./node_modules/
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node backend/package.json ./backend/
COPY --chown=node:node frontend/package.json ./frontend/
COPY --chown=node:node backend/src ./backend/src/
COPY --chown=node:node backend/scripts/migrate.ts ./backend/scripts/migrate.ts
COPY --chown=node:node backend/migrations ./backend/migrations/
# Public CA only; private HTTPS keys belong in runtime mounts.
COPY --chown=node:node backend/certs/prod-ca-2021.crt ./backend/certs/
COPY --chown=node:node assets/logo.png ./assets/logo.png
COPY --chown=node:node shared ./shared/
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist/
RUN mkdir -p /app/backend/backups /app/backend/logs \
    && chown -R node:node /app/backend/backups /app/backend/logs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
WORKDIR /app/backend
CMD ["node", "--import", "tsx", "--import", "./src/services/sentryInstrumentation.ts", "src/index.ts"]
