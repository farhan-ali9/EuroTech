# ── build the static site ──
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Mapbox token is baked in at build time (it's a public pk. token).
ARG VITE_MAPBOX_TOKEN
RUN echo "VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN}" > .env.production && npm run build

# ── serve with Caddy (static + API reverse-proxy + self-signed TLS) ──
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
