FROM node:22-slim AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY tsconfig.base.json turbo.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/gm-bot/package.json ./packages/gm-bot/package.json

RUN npm install

COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src
COPY packages/gm-bot/tsconfig.json ./packages/gm-bot/tsconfig.json
COPY packages/gm-bot/src ./packages/gm-bot/src

RUN npm run build --workspace @survivor/shared \
  && npm run build --workspace @survivor/gm-bot \
  && npm prune --omit=dev

FROM node:22-slim AS runtime

ENV NODE_ENV=production \
  DB_PATH=/app/packages/gm-bot/data/survivor.db \
  GAME_DATA_DIR=/app/packages/gm-bot/game-data-content

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/gm-bot/package.json ./packages/gm-bot/package.json
COPY --from=build /app/packages/gm-bot/dist ./packages/gm-bot/dist

RUN mkdir -p /app/packages/gm-bot/data /app/packages/gm-bot/game-data-content \
  && chown -R node:node /app

USER node

WORKDIR /app/packages/gm-bot

CMD ["node", "dist/index.js"]
