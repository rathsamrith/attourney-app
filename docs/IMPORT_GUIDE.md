# Jira import guide — Attest (Project 6)

Import the plan (`jira-wbs.csv`: 10 Epics → 50 User Stories → 250 Tasks) into the
**AA** project on `kai-dev.atlassian.net` (a **team-managed Scrum** project).
You need Jira **admin** access to use the CSV importer.

---

## Checklist

### 1. Prep AA (one-time)
AA is a Scrum project, so sprints are built in — just create them:
- [ ] **Backlog** → **Create sprint** ×4, then **••• → Edit sprint** and name them exactly:
  - [ ] `Sprint 1 - Data Collection & Design`  (2026-10-20 → 2026-10-26)
  - [ ] `Sprint 2 - Implementation`  (2026-10-27 → 2026-11-02)
  - [ ] `Sprint 3 - Testing`  (2026-11-03 → 2026-11-09)
  - [ ] `Sprint 4 - Deployment & Submission`  (2026-11-10 → 2026-11-13)
- [ ] **Board → ••• → Configure board → Columns** → make 5 columns:
      **Data Collection Backlog · Design · Implementation · Testing · Deployment**
      (each column is backed by a status of the same name)
- [ ] Add the 6 members to the project so they're assignable
      (Project settings → Access / People)

### 2. Open the importer
- [ ] **Gear (Settings) → System → Import and Export → External System Import → CSV**
      — `https://kai-dev.atlassian.net/secure/admin/views/ExternalImport1.jspa`
- [ ] Upload **`docs/jira-wbs.csv`**; advanced options: delimiter `,`, encoding `UTF-8`
- [ ] Import to existing project → **AA**

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

> Team-managed projects use a single **Parent** field, so mapping `Parent Id → Parent`
> links **both** Story → Epic and Sub-task → Story.

### 4. Map values
- [ ] **Assignee** → map each name (Rath, Mai Samorn, Chhun Senghak, Chandy Moeun,
      Chhim Kimheng, Hort Ranut) to its kai-dev account
- [ ] **Status** → the 5 board columns
- [ ] **Sprint** → the 4 sprints
- [ ] **Begin import** (310 rows → 10 Epics, 50 Stories, 250 Sub-tasks)

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
If stories aren't nested under epics after import:
- Re-check that `Parent Id` was mapped to **Parent** (not left unmapped).
- Or set the parent on the affected stories in the backlog (drag under the epic).
- Or run `jira_push.py` (REST API) which links all three levels — see `JIRA_PUSH.md`
  (needs a kai-dev API token and member accountIds).

## Notes
- I don't have kai-dev credentials, so assignees are mapped in the wizard (step 4).
  Share a read-only kai-dev token if you want me to resolve the account IDs.
- Alternative: the OpenProject `op_*.rb` scripts build the equivalent board (see the
  top-level `README.md`).
