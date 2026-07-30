FROM node:22.13.1-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w @isms/web

FROM node:22.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S isms && adduser -S isms -G isms
COPY --from=build --chown=isms:isms /app/apps/web/.next/standalone ./
COPY --from=build --chown=isms:isms /app/apps/web/.next/static ./apps/web/.next/static
USER isms
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
