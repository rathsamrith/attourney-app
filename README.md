# Attest

Remote hearing management: check-in and identity verification, the live record, exhibits, sealed tribunal votes, and a hash-locked transcript. Specification: *Attest: user flows, database ERD and delivery tasks* v0.1.

| Folder | Stack |
| --- | --- |
| `backend/` | NestJS 12, Prisma 7 + PostgreSQL 16, Socket.IO, OIDC token verification with `jose` |
| `frontend/` | React 19, Vite, Tailwind 4, shadcn/ui, TanStack Query, `react-oidc-context` |
| `infra/` | Keycloak dev realm |

Video runs through a LiveKit SFU; the API only issues room tokens. Vendor services (face match, certificate OCSP, HSM signing, RFC 3161 timestamps, object storage) sit behind interfaces in `backend/src/providers/` with development fakes and local-disk storage.

## Run everything (Docker)

One command builds and starts the whole system — Postgres, Redis, Keycloak, LiveKit, the API (migrated and seeded automatically) and the web app:

```sh
docker compose up -d --build        # first run builds the images; later runs: docker compose up -d
```

Then open **http://localhost:5173** and sign in with any dev user below (password `attest`). API docs are at http://localhost:3000/api/docs; Keycloak admin at http://localhost:8080 (`admin` / `admin`). Stop with `docker compose down` (add `-v` to also wipe the database and stored exports).

The backend container applies migrations on every start and seeds the database once (when the `matters` table is empty). The token issuer is `http://localhost:8080` (what the browser uses); the backend validates that issuer but fetches Keycloak's signing keys over the internal network at `http://keycloak:8080` (`OIDC_JWKS_URI`), so no hosts-file setup is needed. This stack is for local use, not production.

## Project management (OpenProject)

A self-hosted OpenProject Community instance tracks the delivery work:

```sh
docker compose -f docker-compose.openproject.yml up -d     # http://localhost:8090 (admin / admin)
```

Seed the "Attest" project (6 members, 10 Epics, 10 User Stories, 30 Tasks across a 5-column board and 4 sprints), build the Sprint → Epic → User Story → Task hierarchy, and turn on the Scrum/Backlogs board. The scripts are idempotent:

```sh
docker compose -f docker-compose.openproject.yml cp docs/op_seed.rb      openproject:/tmp/op_seed.rb
docker compose -f docker-compose.openproject.yml cp docs/op_hierarchy.rb openproject:/tmp/op_hierarchy.rb
docker compose -f docker-compose.openproject.yml cp docs/op_backlogs.rb  openproject:/tmp/op_backlogs.rb
docker compose -f docker-compose.openproject.yml cp docs/op_board.rb     openproject:/tmp/op_board.rb
docker compose -f docker-compose.openproject.yml cp docs/op_estimate.rb  openproject:/tmp/op_estimate.rb
docker compose -f docker-compose.openproject.yml exec openproject bundle exec rails runner /tmp/op_seed.rb
docker compose -f docker-compose.openproject.yml exec openproject bundle exec rails runner /tmp/op_hierarchy.rb
docker compose -f docker-compose.openproject.yml exec openproject bundle exec rails runner /tmp/op_backlogs.rb
docker compose -f docker-compose.openproject.yml exec openproject bundle exec rails runner /tmp/op_board.rb
docker compose -f docker-compose.openproject.yml exec openproject bundle exec rails runner /tmp/op_estimate.rb
```

`op_board.rb` adds a 5-column "Attest Scrum Board" (a Basic board with one status-filtered list per column). `op_estimate.rb` sets estimated time on tasks and story points on user stories. If a member login ever fails, `op_fix_users.rb` re-sets the six member passwords.

The same plan can be loaded into Jira as a 3-level breakdown — **Epic (module) → User Story (function) → Task (sub-task)**, 10 Epics / 50 User Stories / 250 Tasks. Bulk-import `docs/jira-wbs.csv` (or the per-person files in `docs/jira-split/`) via Jira's CSV importer, or push it over the Jira Cloud REST API with `docs/jira_push.py` (linked, assigned, estimated, sub-tasks moved into the 5 board columns — see `docs/JIRA_PUSH.md`). The earlier flat version (10 Epics + 30 Tasks) remains in `docs/jira-import.csv`.

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
