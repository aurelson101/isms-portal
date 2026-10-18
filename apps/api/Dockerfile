FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN npm ci
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build -w @isms/api \
    && npm ci --omit=dev --workspace @isms/api \
    && mkdir -p apps/api/node_modules \
    && npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl \
    && apk upgrade --no-cache \
    && addgroup -S isms && adduser -S isms -G isms
COPY --from=build --chown=isms:isms /app/node_modules ./node_modules
COPY --from=build --chown=isms:isms /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=isms:isms /app/apps/api/dist ./dist
COPY --chown=isms:isms deploy/monitoring ./dist/monitoring
COPY --chown=isms:isms deploy/compose/observability-syslog.yml ./dist/monitoring/observability-syslog.yml
COPY --from=build --chown=isms:isms /app/apps/api/prisma ./prisma
COPY --chown=isms:isms scripts/container-entrypoint.sh /usr/local/bin/isms-entrypoint
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn*
USER isms
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/isms-entrypoint"]
CMD ["node", "dist/main.js"]
