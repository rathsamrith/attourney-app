# Attest — System Flow & User Guide

Attest runs a remote hearing from check-in through a sealed, certified record. This guide
walks the flow end to end and shows what each role does at each step.

## Who does what (roles)

| Role | Does |
| --- | --- |
| **Record officer** | Opens sessions, runs the check-in desk, manual identity override, files errata, seals and exports the record |
| **Presiding adjudicator** | Controls the record (on/off), rules on objections, admits/excludes exhibits, grants continuances |
| **Panelist (adjudicator)** | Attends, casts a sealed deliberation ballot |
| **Plaintiff / Defense counsel** | Appears, offers exhibits, raises objections, uses side caucus |
| **Witness** | Checks in, is sworn, testifies |
| **Court reporter** | Produces and corrects the transcript |

Your role and side come from Attest's own user record (Keycloak only proves who you are).
Screens you can't use stay visible with the reason why.

## The flow, stage by stage

```
 Sign in ─▶ Docket ─▶ Check-in ─▶ Hearing (on the record) ─▶ Deliberation ─▶ Seal & Export
   OIDC      pick a    verify ID      transcript · objections     sealed          hash-lock +
             session    + oath        · exhibits · caucus · video  ballots         sign + certify
```

### 1. Sign in
Open the web app and sign in through Keycloak (OIDC). Attest looks you up by email and
loads your role, side, and the screens you may use.

### 2. Docket — pick a session
The **Docket** lists hearings by day/week with their status. The **record officer** (or
presiding) opens the session for the matter being heard.

### 3. Check-in *(rule R1)*
Each participant, from the **check-in** screen:
1. **Device check** — camera/mic/connection.
2. **Identity** — either a **face match** (liveness + 1:1, must clear 0.90) or a
   **certificate login**.
3. **Oath/affirmation**, then **admission** to the hearing.

If identity fails **three times**, the **record officer** verifies the person manually
from the **check-in desk** and admits them.

### 4. The hearing — on the record *(rules R2, R3, R7)*
The **presiding adjudicator** puts the session **on the record** (sworn time only counts
while on the record). During the hearing:
- **Appearances** are entered.
- **Court reporter** writes the **transcript**; corrections create new versions (nothing
  is overwritten).
- **Counsel** raise **objections**; the **presiding** rules on each.
- **Exhibits** *(R7)*: counsel **offers** an exhibit (it gets an official label), the
  **presiding rules** to admit or exclude, then it is **published**. Each side sees only
  what it's entitled to.
- **Caucus**: a side can move to a private breakout room; sworn time pauses there.
- **Continuances**: the presiding can grant a recess.
- **Video** runs through LiveKit; Attest issues the room token.

### 5. Deliberation — sealed vote *(rule R6)*
After the hearing, each **panelist** casts an **encrypted ballot**. No vote is visible to
anyone until **every** panelist has sealed — then all reveal at once.

### 6. Seal & certify the record *(rules R4, R5)*
The **record officer**:
1. Handles **errata** during the errata window (file, decide), then **closes** the window.
2. **Locks** the transcript: SHA-256 hash → **HSM signature** → **RFC 3161 timestamp**.
3. **Exports** a **certified ZIP** (transcript + manifest + chain of custody) that can be
   **verified** against the seal by anyone later.

### Throughout
- **Audit trail** *(R8)*: every action is recorded in a tamper-evident hash chain;
  an hourly job checks it.
- **Realtime**: the screen updates live as others act (respecting side visibility).
- **Notifications**: you're alerted to actions relevant to your role.
- **Language**: switch between **English** and **Khmer** anytime.

## If a control is blocked
Attest enforces the hearing rules. A blocked button stays visible and shows the reason and
its rule number (R1–R8) — e.g. you can't rule on an exhibit before it's offered, or vote
before the hearing closes. Do the prerequisite step and the control unblocks.

## Role cheat sheet

- **Record officer:** Docket → open session → run check-in desk (+manual override) →
  (after hearing) errata → seal → export.
- **Presiding:** go on the record → manage appearances → rule objections → admit/exclude
  exhibits → grant continuances → go off the record.
- **Counsel:** check in → appear → offer exhibits → raise objections → use side caucus.
- **Panelist:** attend → cast sealed ballot after the hearing.
- **Witness:** check in → be sworn → testify.
- **Court reporter:** write and correct the transcript.

## Dev / demo logins
Local stack (`docker compose up -d`) seeds dev users; sign in at `http://localhost:5173`
(all passwords `attest`): `sokha.prum` (officer), `ruth.okafor` (presiding),
`wei.chen` / `h.albrecht` (panelists), `maya.lindqvist` (plaintiff counsel),
`daniel.osei` (defense counsel), `jordan.reyes` (witness), `dara.kim` (court reporter).
