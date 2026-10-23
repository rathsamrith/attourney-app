# Jira import guide — Attest (Project 6)

Import the plan (`jira-wbs.csv`: 10 Epics → 50 User Stories → 250 Tasks) into the
**KAN — Project Management** project on `hortranut1111.atlassian.net`.
You need Jira **admin** access.

---

## Checklist

### 1. Prep KAN (one-time) — KAN is Kanban, so turn on sprints first
- [ ] **Project settings → Features** → enable **Sprints** and **Backlog**
- [ ] **Backlog → Create sprint** ×4, then **••• → Edit sprint** and name them exactly:
  - [ ] `Sprint 1 - Data Collection & Design`  (2026-10-20 → 2026-10-26)
  - [ ] `Sprint 2 - Implementation`  (2026-10-27 → 2026-11-02)
  - [ ] `Sprint 3 - Testing`  (2026-11-03 → 2026-11-09)
  - [ ] `Sprint 4 - Deployment & Submission`  (2026-11-10 → 2026-11-13)
- [ ] **Board → ••• → Configure board → Columns** → create 5 columns:
      **Data Collection Backlog · Design · Implementation · Testing · Deployment**
- [ ] *(optional)* Invite **Mai Samorn** and **Chhim Kimheng** so they're assignable

### 2. Open the importer
- [ ] **Gear (Settings) → System → Import and Export → External System Import → CSV**
      — `https://hortranut1111.atlassian.net/secure/admin/views/ExternalImport1.jspa`
- [ ] Upload **`docs/jira-wbs.csv`**; advanced options: delimiter `,`, encoding `UTF-8`
- [ ] Import to existing project → **KAN**

### 3. Map fields

| CSV column | Jira field |
|---|---|
| `Issue Id` | **Issue Id** |
| `Parent Id` | **Parent** |
| `Issue Type` | Issue Type |
| `Summary` | Summary |
| `Epic Name` | Epic Name |
| `Assignee` | Assignee |
| `Status` | Status |
| `Sprint` | Sprint |
| `Story Points` | Story point estimate |
| `Due Date` | Due date |
| `Labels` | Labels |

### 4. Map values
- [ ] **Assignee** → each Jira account (Rath → you; Chandy Moeun; Chhun Senghak →
      "Senghak chhun"; Hort Ranut → "Hort ranut"; Mai/Kimheng if invited)
- [ ] **Status** → the 5 board columns
- [ ] **Sprint** → the 4 sprints
- [ ] **Begin import** (310 rows)

### 5. Verify
- [ ] Each Epic contains its Stories; each Story contains its 5 Sub-tasks
- [ ] Every board column has tasks; every sprint has its stories
- [ ] Work is spread across all members (see the per-member/per-sprint table in the PDF)

---

## Which file to import
- **`jira-wbs.csv`** — the whole plan in one import (recommended; assigns the whole
  team, since stories are distributed across members).
- **`jira-split/*.csv`** — per-member worklists; they share epics, so **don't** import
  them all into one project (epics would duplicate). Use for individual tracking.

## If the hierarchy doesn't link
Team-managed projects use a single **Parent** field, carried here by `Issue Id` +
`Parent Id`. Sub-task → Story linking is reliable; Story → Epic can be inconsistent
on team-managed CSV import. If stories aren't nested under epics after import:
- Re-check that `Parent Id` was mapped to **Parent** (not left unmapped).
- Or set the parent on the affected stories in the backlog (drag under the epic).
- Or run `jira_push.py` (REST API) which links all three levels correctly — see
  `JIRA_PUSH.md`.

## Alternatives
- **Automated:** `python docs/jira_push.py` (see `JIRA_PUSH.md`).
- **OpenProject:** the `op_*.rb` scripts build the equivalent board (see top-level
  `README.md`).
