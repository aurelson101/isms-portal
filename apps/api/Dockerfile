FROM node:22.13.1-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build -w @isms/api && npm prune --omit=dev

FROM node:22.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S isms && adduser -S isms -G isms
COPY --from=build --chown=isms:isms /app/node_modules ./node_modules
COPY --from=build --chown=isms:isms /app/apps/api/dist ./dist
COPY --from=build --chown=isms:isms /app/apps/api/prisma ./prisma
USER isms
EXPOSE 3001
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
