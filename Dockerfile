# PaperTrail: one container serving the Hono API and the built Vue client (Nebius Serverless Endpoint, linux/amd64).
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 compiles a native module when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Keep production dependencies only (the bundle externalizes better-sqlite3 and other packages)
RUN CI=true pnpm prune --prod

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN mkdir -p /data
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/demo/recordings ./server/demo/recordings
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
