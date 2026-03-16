# --- Build stage ---
FROM node:22-slim AS build
WORKDIR /app/packages/token-server

COPY packages/token-server/package.json ./
RUN npm install

COPY packages/token-server/src/ ./src/
COPY packages/token-server/tsconfig.json ./
COPY tsconfig.base.json /app/tsconfig.base.json

RUN npx tsc && cp -r src/prompts dist/prompts

# --- Production stage ---
FROM node:22-slim
WORKDIR /app

COPY packages/token-server/package.json ./
RUN npm install --omit=dev

COPY --from=build /app/packages/token-server/dist ./dist

EXPOSE 3001
ENV PORT=3001

CMD ["node", "dist/index.js"]
