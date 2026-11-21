# Attest API — NestJS 12 + Prisma 7. Local/dev image driven by docker-compose.
# Build order matters: `prisma generate` (postinstall) writes src/generated/prisma,
# then `nest build` compiles it into dist/generated/prisma, which `node dist/main` needs.

FROM node:24-bookworm-slim AS base
# Prisma's schema engine (migrate) needs openssl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- build ----------
# Everything below happens inside the image: install deps, generate the Prisma
# client, and compile. Nothing is taken from the host (see .dockerignore).
FROM base AS build
# Schema + config first so the postinstall `prisma generate` has what it needs.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
# `npm ci` is a clean, lockfile-exact install; postinstall runs `prisma generate`.
# Retry/timeout flags make it resilient to flaky networks (ECONNRESET during fetch).
RUN npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
# Keep the full tree: migrate + seed run at startup and need the Prisma CLI,
# tsx, the migrations and the generated client (dist and src/generated).
COPY --from=build /app /app
COPY docker-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["entrypoint.sh"]
