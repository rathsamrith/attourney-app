# Attest

Remote hearing management: check-in and identity verification, the live record, exhibits, sealed tribunal votes, and a hash-locked transcript. Specification: *Attest: user flows, database ERD and delivery tasks* v0.1.

| Folder | Stack |
| --- | --- |
| `backend/` | NestJS 12, Prisma 7 + PostgreSQL 16, Socket.IO, OIDC token verification with `jose` |
| `frontend/` | React 19, Vite, Tailwind 4, shadcn/ui, TanStack Query, `react-oidc-context` |
| `infra/` | Keycloak dev realm |

Video runs through a LiveKit SFU; the API only issues room tokens. Vendor services (face match, certificate OCSP, HSM signing, RFC 3161 timestamps, object storage) sit behind interfaces in `backend/src/providers/` with development fakes and local-disk storage.

## Run locally

Needs Node 24+ and Docker Desktop (with WSL 2 on Windows).

```sh
docker compose up -d                  # postgres, redis, keycloak (:8080), livekit (:7880)

cd backend
npm install
npx prisma migrate deploy             # schema + rule backstops
npx prisma db seed                    # dev users, one arbitration matter, one session
npm run start:dev                     # http://localhost:3000/api, docs at /api/docs

cd ../frontend
npm install
npm run dev                           # http://localhost:5173
```

Dev users (password `attest`): `sokha.prum` (record officer), `ruth.okafor` (presiding adjudicator), `wei.chen` and `h.albrecht` (panelists), `maya.lindqvist` (plaintiff counsel), `daniel.osei` (defense counsel), `jordan.reyes` (witness), `dara.kim` (court reporter).

After editing `infra/keycloak/attest-realm.json`, run `docker compose up -d --force-recreate keycloak`; Keycloak only imports the realm into a fresh container.

**Development fakes:** any PEM certificate passes; a face match passes unless you tick "Simulate a failed match" on the check-in screen. After three failed attempts, the record officer verifies the person manually from the check-in desk.

**Without Docker**, `npx prisma dev` in `backend/` runs a local Postgres for migrations, seeding and tests. Sign-in still needs Keycloak.

## How the code is organized

- **Every state change goes through `CommandRunner`** (`backend/src/audit/command-runner.ts`). It runs your rule checks and writes, then appends the hash-chained audit event in the same transaction (R8), and publishes the event to Socket.IO clients only after commit.
- **Rule violations are `BlockedException(reason, 'R4')`**, which returns 409 with `{ rule, reason }`. The frontend shows `reason` on the blocked control. Database triggers in `prisma/migrations/*_rule_backstops` enforce the same rules and are mapped to the same 409.
- **Role and side live in our `users` table**, not in the token. Keycloak proves identity; `TokenVerifier` looks the user up by email.
- **Screen access comes from the API** (`GET /api/me`, `backend/src/auth/permissions.ts`). Blocked screens stay in the navigation with their reason.
- **The frontend client is generated.** `npm run openapi` in `backend/` writes `frontend/openapi.json` (the API also writes it on startup); then run `npm run gen:api` in `frontend/`.

## Tests

```sh
cd backend
npm test                              # unit
npm run test:e2e                      # creates, migrates and seeds <db>_test next to DATABASE_URL
```
