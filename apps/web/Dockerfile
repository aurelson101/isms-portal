FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w @isms/web

FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
ENV NODE_ENV=production
WORKDIR /app
RUN apk upgrade --no-cache \
    && addgroup -S isms && adduser -S isms -G isms
COPY --from=build --chown=isms:isms /app/apps/web/.next/standalone ./
COPY --from=build --chown=isms:isms /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=isms:isms /app/apps/web/public ./apps/web/public
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn*
USER isms
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
