# PaperTrail: one container serving the Hono API and the built Vue client (Nebius Serverless Endpoint, linux/amd64).
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 compiles a native module when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Keep production dependencies only (the bundle externalizes better-sqlite3 and other packages)
RUN CI=true pnpm prune --prod

FROM node:22-slim
WORKDIR /app
# PAPERTRAIL_HOST (not HOST) makes the server listen on all interfaces inside the container; publish the port to loopback
# unless you put a reverse proxy in front. ALLOWED_ORIGINS is REQUIRED when the app is reached by a public name: set it to the
# public origin(s), e.g. ALLOWED_ORIGINS=https://papertrail.example (comma separated); requests from other origins/hosts are refused.
ENV NODE_ENV=production PORT=3000 PAPERTRAIL_HOST=0.0.0.0 DATA_DIR=/data WORKSPACE_DIR=/workspace LOG_DIR=/logs
# user data (library DB, question folders with notes and libraries) and logs live in volumes, owned by the non-root user
RUN mkdir -p /data /workspace /logs && chown -R node:node /data /workspace /logs
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/demo/recordings ./server/demo/recordings
COPY --from=build /app/docs/data ./docs/data
VOLUME ["/data", "/workspace", "/logs"]
USER node
EXPOSE 3000
# loopback inside the container is an allowed Host for the API guard
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
