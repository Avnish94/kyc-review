# syntax=docker/dockerfile:1
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build \
  && npx esbuild scripts/dispatch-outbox.ts --bundle --platform=node --target=node22 \
     --external:@prisma/client --outfile=dist/scripts/dispatch-outbox.js \
  && npm install --prefix /opt/prisma-cli --no-save --no-audit --no-fund \
     "prisma@$(node -p "require('prisma/package.json').version")"

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/dist/scripts ./scripts
# Prisma CLI (same version as the app) + migrations for the release step:
#   node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /opt/prisma-cli /opt/prisma-cli
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
