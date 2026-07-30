FROM node:22.13.1-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN npm ci
COPY apps/api apps/api
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build -w @isms/api \
    && npm ci --omit=dev \
    && npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:22.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S isms && adduser -S isms -G isms
COPY --from=build --chown=isms:isms /app/node_modules ./node_modules
COPY --from=build --chown=isms:isms /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=isms:isms /app/apps/api/dist ./dist
COPY --from=build --chown=isms:isms /app/apps/api/prisma ./prisma
USER isms
EXPOSE 3001
CMD ["sh", "-c", "node prisma/prepare-migrations.js && npx prisma migrate deploy --schema prisma/schema.prisma && if [ \"${DEMO_MODE:-false}\" = \"true\" ]; then node prisma/seed.js; fi && node dist/main.js"]
