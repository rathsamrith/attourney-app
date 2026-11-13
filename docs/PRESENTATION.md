# Attest — Presentation Guide (per member)

**Project 6: Legal Deposition & Regulatory Hearing Management Platform.**
Each member presents the module area they own end-to-end. Every section has:
**1. Features · 2. Code implemented · 3. Demo → flow.**

## Before you present
- Start the stack: `docker compose up -d --build` → app at **http://localhost:5173**,
  API docs at **http://localhost:3000/api/docs**.
- Dev users (password `attest`): `sokha.prum` (record officer), `ruth.okafor`
  (presiding adjudicator), `wei.chen` & `h.albrecht` (panelists), `maya.lindqvist`
  (plaintiff counsel), `daniel.osei` (defense counsel), `jordan.reyes` (witness),
  `dara.kim` (court reporter).
- Roles → screens (RBAC): checkin/hearing/audit = all; exhibits = counsel+adj;
  caucus = counsel; deliberation = adj; sealing/docket = officer.

---

## 1. Rath Samrith — Check-in & Identity Verification

### 1. Features
- Pre-join **device check** (camera / mic / connection).
- **Identity verification**: biometric **face match** (needs score ≥ 0.90 + liveness)
  or **digital certificate** (OCSP) before entering the room.
- **Oath / affirmation** step.
- Record-officer **Check-in Desk**: live queue, **manual verification** fallback
  after 3 failed attempts, and **admit** to the session.

### 2. Code implemented
- Backend `backend/src/checkin/checkin.controller.ts`, `checkin.service.ts`
  - `GET /sessions/:id/checkin` · `POST /sessions/:id/checkin/identity` ·
    `POST /sessions/:id/checkin/oath`
  - `GET /sessions/:id/checkin/queue` · `POST /participants/:id/manual-verification`
    · `POST /participants/:id/admit` (officer-only)
- Provider interfaces `backend/src/providers/providers.ts` (`FACE_MATCH`,
  `CERTIFICATE_VALIDATOR`), dev fakes `providers/fakes.ts`
- Frontend `frontend/src/features/checkin/{checkin-page,device-check,identity-step,checkin-desk}.tsx`

### 3. Demo → flow
1. Sign in **jordan.reyes** (witness) → **Check-in** screen.
2. Device check passes → **Identity step** → face match passes (or tick *"Simulate a
   failed match"*).
3. On pass → **affirm oath** → status becomes verified.
4. Fallback: fail the match 3× → sign in **sokha.prum** (officer) → **Check-in Desk**
   → witness in the queue → **Manual verification** (document checked) → **Admit**.

---

## 2. Chandy Moeun — Live Proceeding & Transcript

### 1. Features
- **Live video bridge** (LiveKit SFU) via per-room media tokens; media never touches
  the API.
- **Running transcript**: the reporter adds lines; lines can be corrected.
- **Objections**: counsel raises (grounds + transcript line); adjudicator rules
  sustained/overruled.
- **Continuances**: counsel requests (reason + proposed resume); adjudicator rules →
  recess.
- **Caucus rooms**: counsel opens a private side room; join / leave / close.
- Live **record controls** + on-screen record indicator.

### 2. Code implemented
- Backend `backend/src/proceeding/proceeding.controller.ts` + services
  `transcript.service.ts`, `objections.service.ts`, `continuances.service.ts`,
  `caucus.service.ts`, `media.service.ts`
  - transcript: `GET/POST /sessions/:id/transcript`, `PATCH /transcript-lines/:id`
  - objections: `GET/POST /sessions/:id/objections`, `POST /objections/:id/ruling`
  - continuances: `GET/POST /sessions/:id/continuances`, `POST /continuances/:id/ruling`
  - caucus: `GET/POST /sessions/:id/caucus`, `POST /caucus/:id/{join,leave,close}`
  - media: `POST /sessions/:id/media-token`
- Live record state `backend/src/sessions/sessions.controller.ts` →
  `POST /sessions/:id/record-state`
- Frontend `frontend/src/features/hearing/{hearing-page,transcript-panel,objections-panel,continuances-panel,record-controls}.tsx`,
  `features/caucus/caucus-page.tsx`, `components/attest/{video-panel,record-indicator}.tsx`

### 3. Demo → flow
1. Sign in **sokha.prum** (officer) → open the hearing → set **record state → recording**
   (indicator turns on).
2. Sign in **dara.kim** (reporter) → **Hearing** → add transcript lines live.
3. Sign in **maya.lindqvist** (counsel) → raise an **objection** on a line (grounds:
   hearsay).
4. Sign in **ruth.okafor** (adjudicator) → **rule** the objection → shows in transcript.
5. (Optional) counsel requests a **continuance** → adjudicator grants → recess; counsel
   opens a **caucus** room and joins. Each client joins the LiveKit room via its media token.

---

## 3. Mai Samorn — Exhibits & Vendor Integrations

### 1. Features
- **Exhibits**: counsel uploads/tags a PDF (≤ 50 MB); **offer** into evidence;
  adjudicator **rules** admit/exclude; **publish** to a shared viewer for everyone;
  end publication. Per-side access to the streamed file.
- **Vendor integrations (Providers)**: pluggable interfaces for face match, certificate
  OCSP, HSM signer, RFC 3161 timestamp and object storage — deterministic **dev fakes**
  + local-disk storage now, production adapters swapped by dependency injection.

### 2. Code implemented
- Backend `backend/src/exhibits/exhibits.controller.ts`, `exhibits.service.ts`
  - `GET /sessions/:id/exhibits` · `POST /exhibits` (multipart, counsel) ·
    `GET /exhibits/:id/file`
  - `POST /exhibits/:id/offer` (counsel) · `POST /exhibits/:id/ruling` (adj) ·
    `POST /exhibits/:id/publish` (counsel)
  - `GET /sessions/:id/publication` · `POST /sessions/:id/publication/end`
- Providers `backend/src/providers/providers.ts` (interfaces) + `providers/fakes.ts`
- Frontend `frontend/src/features/exhibits/exhibits-page.tsx`,
  `components/attest/exhibit-viewer.tsx`, `features/hearing/publication-panel.tsx`

### 3. Demo → flow
1. Sign in **maya.lindqvist** (counsel) → **Exhibits** → upload a PDF with a title → **tag**.
2. **Offer** it into evidence.
3. Sign in **ruth.okafor** (adjudicator) → **rule → admit**.
4. Counsel **publishes** → all participants see it in the shared viewer (publication panel).
5. Providers: open `providers.ts` to show the five interfaces, and explain the local
   **fakes** vs production **useClass** swap (why a face match/sign/store "just works" in dev).

---

## 4. Chhun Senghak — Deliberation, Record Sealing & Auth

### 1. Features
- **Sealed deliberation & voting (R6)**: adjudicator-only ballot; votes **encrypted**
  until sealed; outcome revealed on seal; counsel/witness can't see or cast.
- **Record sealing (E5, R4/R5)**: errata window after a session closes (participants
  file corrections, officer accepts/rejects, close window) → **lock transcript**
  (SHA-256 digest + **HSM signature** + **RFC 3161 timestamp**) → **certified export**
  (ZIP: canonical transcript, readable text, errata CSV, hash-chained custody log,
  manifest) → **verify** seal vs DB.
- **Auth, roles & permissions**: Keycloak **OIDC**; `TokenVerifier` maps the token to a
  user by email; role & side live in our DB (not the token); **RBAC** screen matrix with
  blocked-screen reasons; API enforces `@Roles`; ethical-wall side scoping (R7).

### 2. Code implemented
- Deliberation `backend/src/deliberation/{deliberation.controller,deliberation.service,ballot-crypto}.ts`
  - `GET /sessions/:id/deliberation` · `POST /sessions/:id/ballot` ·
    `POST /sessions/:id/ballot/seal` (adj-only)
- Record sealing `backend/src/record/{record.controller,record.service,canonical,record.jobs}.ts`
  - `POST /sessions/:id/errata` · `POST /errata/:id/decision` · `POST /sessions/:id/errata/close`
  - `POST /sessions/:id/seal/lock` · `POST /sessions/:id/exports` · `GET /exports/:id/file`
- Auth `backend/src/auth/{token-verifier.service,auth.guard,permissions,decorators}.ts`
- Frontend `frontend/src/features/deliberation/*`, `features/sealing/sealing-page.tsx`,
  `app/auth-gate.tsx`, `components/attest/blocked-state.tsx`

### 3. Demo → flow
1. **RBAC**: sign in **jordan.reyes** (witness) → Deliberation/Sealing show as **blocked**
   with a reason. Sign in **ruth.okafor** (adj) → Deliberation opens.
2. **Deliberation**: each adjudicator (ruth.okafor, wei.chen, h.albrecht) casts a ballot →
   **seal** → outcome revealed (votes were encrypted until then).
3. **Sealing** as **sokha.prum** (officer): with the session closed → file an **erratum**,
   accept it, **close** the window → **Lock transcript** (digest + signature + timestamp)
   → **Certified export** → download the ZIP and open `manifest.json` (digest, signature,
   custody log).

---

## 5. Chhim Kimheng — Audit, Realtime & Docket

### 1. Features
- **Tamper-evident audit trail (R8)**: every state change writes its **hash-chained**
  audit event in the *same transaction* (via `CommandRunner`); `prevHash → hash` chain.
- **Audit viewer**: filter by session; side-scoped visibility (R7).
- **Realtime**: Socket.IO gateway publishes domain events **after commit** → the UI
  updates live.
- **Docket & notifications**: weekly docket + 30-day metrics (officer); in-app
  notifications feed.

### 2. Code implemented
- Audit `backend/src/audit/{audit.controller,audit.service,command-runner,audit-hash,domain-events}.ts`
  - `GET /audit?sessionId=&limit=`
- Realtime `backend/src/realtime/realtime.gateway.ts`; frontend `src/api/realtime.ts`
- Docket `backend/src/docket/{docket.controller,docket.service}.ts` → `GET /docket`,
  `GET /docket/metrics`
- Notifications `backend/src/notifications/{notifications.controller,notifications}.ts`
- Frontend `frontend/src/features/audit/audit-page.tsx`, `features/docket/docket-page.tsx`,
  `components/attest/notifications-menu.tsx`

### 3. Demo → flow
1. Perform any action (add a transcript line / rule an objection), then open **Audit** →
   new entries appear **live** (realtime), each with a **hash**; side-restricted events
   only show to that side.
2. Show `command-runner.ts`: the change and its audit event commit together (R8), and
   `audit-hash.ts` builds the chain.
3. Sign in **sokha.prum** (officer) → **Docket** → weekly sessions + metrics.
4. An action that notifies (e.g. an objection ruling) → the **notifications** badge
   updates live.

---

## 6. Hort Ranut — Infrastructure, CI/CD & Deployment

### 1. Features
- **One-command Dockerized stack**: Postgres, Redis, Keycloak (OIDC realm auto-import),
  LiveKit SFU, backend (migrate + seed on start), frontend (nginx).
- Backend container **applies migrations every start** and **seeds once**; health checks
  and a storage volume.
- Separate **OpenProject** compose for project management.

### 2. Code implemented
- `docker-compose.yml` (full stack) · `docker-compose.openproject.yml`
- `backend/Dockerfile`, `backend/.dockerignore`, `backend/docker-entrypoint.sh`
- `frontend/Dockerfile` (nginx) · `infra/keycloak/attest-realm.json`
- `backend/prisma/migrations/*`, `backend/prisma/seed.ts`
- Health `backend/src/health/health.controller.ts`

### 3. Demo → flow
1. From a clean checkout: `docker compose up -d --build` — the whole system comes up.
2. Show the running services: **:5173** (app), **:3000/api/docs** (Swagger),
   **:8080** (Keycloak admin), **:7880** (LiveKit).
3. Backend logs: migrations applied + one-time seed; `GET /api/health` returns OK.
4. Reset with `docker compose down -v`.

---

## Suggested end-to-end demo order (one hearing lifecycle)
Ranut (bring the stack up) → Rath (check-in a witness) → Chandy (record + transcript +
objection ruling) → Mai (tag, admit, publish an exhibit) → Senghak (adjudicators vote &
seal; officer locks + exports the record) → Kimheng (show the live hash-chained audit
trail + docket). This walks the whole system and shows every member's work in sequence.
