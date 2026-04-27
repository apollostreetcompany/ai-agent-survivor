FROM node:22-slim AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/agent-template/package.json ./packages/agent-template/package.json

RUN npm install

COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src
COPY packages/agent-template/tsconfig.json ./packages/agent-template/tsconfig.json
COPY packages/agent-template/src ./packages/agent-template/src

RUN npm run build --workspace @survivor/shared \
  && npm run build --workspace @survivor/agent-template \
  && npm prune --omit=dev

FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  AGENT_WORKSPACE=/app/workspace \
  MEMORY_DB_PATH=/app/data/agent-memory.db

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/agent-template/package.json ./packages/agent-template/package.json
COPY --from=build /app/packages/agent-template/dist ./packages/agent-template/dist

WORKDIR /app/packages/agent-template

COPY packages/agent-template/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh \
  && mkdir -p /app/workspace /app/data \
  && chown -R node:node /app

USER node

ENTRYPOINT ["./entrypoint.sh"]
