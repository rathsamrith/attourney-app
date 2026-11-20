# Attest — Feature Definitions

Attest is a remote-hearing management platform: check-in and identity verification, the
live record, exhibits, sealed tribunal votes, and a hash-locked, certified transcript.
Every state change runs through `CommandRunner`, which enforces the rule checks and
appends a hash-chained audit event in the same transaction. Numbered rules (R1–R8) are
enforced in both application code and database triggers.

## Core hearing features

### 1. Check-in & Identity Verification — `R1`
Before anyone joins a hearing they pass a device check, then prove who they are — by
**biometric face match** (liveness + 1:1 match, threshold 0.90) or by **certificate
login**. They take the oath/affirmation and are admitted. After **three failed
attempts**, the record officer verifies the person manually at the check-in desk.

### 2. Sessions & Hearing Scheduling
The lifecycle of a hearing session: create/schedule a session under a matter, list the
sessions, open one, and drive its **record state** (on/off the record) and participant
**presence** (join/leave). Sworn time accrues only while a session is on the record.

### 3. Live Proceeding & Transcript — `R2`, `R3`
The live hearing: appearances, an **on-the-record transcript** with versioned
corrections, **objections** (counsel raises, presiding rules), **continuances**
(granting recesses), and **video** via LiveKit room tokens. Time on the record is the
basis for sworn-time accounting.

### 4. Caucus (breakout rooms)
Side-private breakout rooms during a hearing — membership is limited to one side, and
sworn time pauses while a caucus is in session.

### 5. Exhibits Management — `R7`
The evidence lifecycle: **offer** (an official label is assigned), **rule** (presiding
admits or excludes), and **publish** — with strict **side-restricted visibility** so a
party sees only what it is entitled to, even in the audit trail.

### 6. Sealed Deliberation & Voting — `R6`
Panel voting by **encrypted ballot**: every vote stays hidden until the entire panel has
sealed, then all reveal simultaneously — no partial results, no influence.

### 7. Record Sealing & Certified Export — `R4`, `R5`
Record integrity: errata filing within a window, then a **hash lock** (SHA-256) of the
transcript, an **HSM signature**, and an **RFC 3161 timestamp**, packaged as a
**certified ZIP export** with a manifest and chain of custody that verifies against the
seal.

## Cross-cutting features

### 8. Audit Trail & Realtime — `R8`
Every state change flows through `CommandRunner`, which appends a **hash-chained audit
event** in the same transaction, then fans the committed event to clients over
**Socket.IO** (content-free; clients refetch, honoring side visibility). An hourly job
checks the chain for tampering.

### 9. Docket & Notifications
A week/day **docket** with per-session sealing status and reporting metrics, plus
**role-based notifications** derived from audit events (each role/subject is told about
the actions relevant to them).

### 10. Auth, Roles & Permissions
Keycloak (OIDC) proves identity; **role and side live in the app's own `users` table**,
not the token. A per-request guard and a permissions map decide screen/action access;
blocked controls stay visible with their reason.

### 11. Vendor Integrations (Providers)
Five external services behind clean interfaces, each with a production adapter and a dev
fake: `HttpFaceMatch` (biometrics), `X509CertificateValidator` (chain + OCSP/CRL),
`KeySigner` (signing), `HttpTimestampAuthority` (RFC 3161 TSA), `RemoteFileStorage`
(object storage) — selected in `providers.module.ts`.

### 12. Internationalization (i18n)
Full **English + Khmer** localization at parity (~460 keys each), with a language
switcher and locale-aware formatting.

## Platform / delivery features

### 13. Infrastructure, CI/CD & Deployment
One-command Dockerized stack (Postgres, Redis, Keycloak, LiveKit, backend with
auto-migrate+seed, frontend), a **CI pipeline** (`.github/workflows/ci.yml`), and a
self-hosted **OpenProject** setup for tracking delivery (`docker-compose.openproject.yml`,
`docs/op_*.rb`).

## Feature → rule → source map

| # | Feature | Rule(s) | Backend | Frontend |
| --- | --- | --- | --- | --- |
| 1 | Check-in & Identity | R1 | `backend/src/checkin` | `frontend/src/features/checkin` |
| 2 | Sessions & Scheduling | — | `backend/src/sessions` | `frontend/src/app/context.tsx`, `features/docket` |
| 3 | Live Proceeding & Transcript | R2, R3 | `backend/src/proceeding` | `frontend/src/features/hearing` |
| 4 | Caucus | — | `backend/src/proceeding/caucus.service.ts` | `frontend/src/features/caucus` |
| 5 | Exhibits | R7 | `backend/src/exhibits` | `frontend/src/features/exhibits` |
| 6 | Sealed Deliberation | R6 | `backend/src/deliberation` | `frontend/src/features/deliberation` |
| 7 | Record Sealing & Export | R4, R5 | `backend/src/record` | `frontend/src/features/sealing` |
| 8 | Audit & Realtime | R8 | `backend/src/audit`, `backend/src/realtime` | `frontend/src/features/audit` |
| 9 | Docket & Notifications | — | `backend/src/docket`, `backend/src/notifications` | `frontend/src/features/docket`, `components/attest/notifications-menu.tsx` |
| 10 | Auth, Roles & Permissions | — | `backend/src/auth` | `frontend/src/auth` |
| 11 | Vendor Integrations | — | `backend/src/providers` | — |
| 12 | Internationalization | — | — | `frontend/src/i18n` |
| 13 | Infrastructure & CI/CD | — | `docker-compose*.yml`, `.github/workflows`, `infra/` | — |
