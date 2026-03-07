# syntax=docker/dockerfile:1.7

ARG APT_DEBIAN_MIRROR=http://mirrors.nju.edu.cn/debian
ARG APT_SECURITY_MIRROR=http://mirrors.nju.edu.cn/debian-security
ARG NPM_REGISTRY=https://registry.npmmirror.com/

FROM node:22-bookworm-slim AS deps
ARG APT_DEBIAN_MIRROR
ARG APT_SECURITY_MIRROR
ARG NPM_REGISTRY
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_AUDIT=false
RUN set -eux; \
  find /etc/apt -maxdepth 2 -type f \( -name 'sources.list' -o -name '*.list' -o -name '*.sources' \) \
    -exec sed -Ei "s|https?://deb.debian.org/debian|${APT_DEBIAN_MIRROR}|g; s|https?://deb.debian.org/debian-security|${APT_SECURITY_MIRROR}|g; s|https?://security.debian.org/debian-security|${APT_SECURITY_MIRROR}|g" '{}' +; \
  apt-get update; \
  apt-get install -y --no-install-recommends python3 make g++; \
  rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
ENV VITE_API_BASE_URL=/
RUN node -e "require('fs').rmSync('dist',{recursive:true,force:true});require('fs').rmSync('apps/admin/dist',{recursive:true,force:true})" \
  && npm run build:gateway \
  && npm run build:admin

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/apps/admin/dist ./apps/admin/dist
RUN mkdir -p .runtime
EXPOSE 3000
CMD ["node", "--import", "tsx", "dist/index.js"]
