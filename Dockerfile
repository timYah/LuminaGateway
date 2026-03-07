# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/package.json
RUN npm ci && npm --prefix apps/admin install --include=optional

FROM deps AS build
WORKDIR /app
COPY . .
ENV VITE_API_BASE_URL=/
RUN node -e "require('fs').rmSync('apps/admin/dist',{recursive:true,force:true})" \
  && npm --prefix apps/admin run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/apps/admin/dist ./apps/admin/dist
RUN mkdir -p .runtime
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/index.ts"]
