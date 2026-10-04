# Attest web — React 19 + Vite, built to static files and served by nginx.
# OIDC settings are inlined by Vite at BUILD time, so they come in as build args.

FROM node:24-bookworm-slim AS build
WORKDIR /app
# The browser reaches Keycloak directly, so this must be a host-resolvable URL.
ARG VITE_OIDC_AUTHORITY=http://localhost:8080/realms/attest
ARG VITE_OIDC_CLIENT_ID=attest-web
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID
# Install, then build, entirely inside the image (nothing is taken from the host).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
