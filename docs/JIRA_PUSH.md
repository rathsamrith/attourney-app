# Pushing the plan into Jira

The Attest (Project 6) plan is a **3-level WBS**:
**Epic (module) → User Story (function) → Task (sub-task)** —
**10 Epics, 50 User Stories, 250 Tasks**. Each user story has 5 tasks (one per
board column), so all five Scrum columns hold 50 tasks each.

Two ways to load it:

- **CSV import** (no code) — import `jira-wbs.csv` (the whole plan) in one run.
  User stories are distributed evenly across all six members and four sprints, so
  one import assigns the whole team. The per-person files in `jira-split/` are
  individual worklists (they share epics — don't import them all into one
  project). See `jira-split/README.md`.
- **API push** (`jira_push.py`) — creates everything over the REST API, linked
  and assigned, and moves each sub-task into its column.

`jira_push.py` uses the standard library only — no `pip install`.

## 1. Get an API token
https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**.

## 2. Set the connection (do NOT commit these)

```sh
export JIRA_BASE_URL="https://kai-dev.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="<the token>"
export JIRA_PROJECT_KEY="AA"
```

PowerShell uses `$env:NAME = "..."`.

## 3. Map members to Jira accounts
Edit `MEMBER_ACCOUNT_IDS` at the top of `jira_push.py` with each member's
**accountId** on the kai-dev site. Look them up with:

```sh
curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "$JIRA_BASE_URL/rest/api/3/user/assignable/search?project=AA&maxResults=100" \
  | python -c "import sys,json;[print(u['accountId'],u['displayName']) for u in json.load(sys.stdin)]"
```

Fill the id for each CSV name (Rath, Mai Samorn, Chhun Senghak, Chandy Moeun,
Chhim Kimheng, Hort Ranut). Members left blank import **unassigned** (with a
warning); everything else still gets created.

## 4. Run

```sh
python docs/jira_push.py --dry-run     # preview what would be created
python docs/jira_push.py               # create for real
```

## What it does
- Resolves each assignee's accountId (or falls back to `MEMBER_EMAILS`).
- Finds the Epic / Story / Sub-task issue-type ids and the Story Points field.
- Creates issues **top-down** — Epics, then Stories (parent = Epic), then
  Sub-tasks (parent = Story) — so the whole hierarchy links.
- Sets assignee, due date, labels, and story points (on stories).
- Moves each sub-task into its board-column **status** and prints the per-column
  count.
- **Best-effort sprints:** assigns each story to its sprint when an Agile board
  exists (sub-tasks inherit their story's sprint).
- **Idempotent:** searches by summary before creating, so re-runs don't duplicate.

## Sprints first (AA is Scrum — sprints are built in)
Create the four sprints before running so the `Sprint` field resolves:
open **Backlog → Create sprint** ×4, then **••• → Edit sprint** and set name /
start / end / goal, using the exact names in `jira-sprints.csv`:
`Sprint 1 - Data Collection & Design`, `Sprint 2 - Implementation`,
`Sprint 3 - Testing`, `Sprint 4 - Deployment & Submission`.

## Board columns (one-time)
A board column is backed by a status. For the five named columns to exist, set the
AA board's columns to **Data Collection Backlog · Design · Implementation ·
Testing · Deployment** (Board → ⋯ → Configure board → Columns) before running.
Missing columns are reported and those sub-tasks stay in the default status; add
the column and re-run.

## Alternatives
- **CSV import** of `jira-wbs.csv` or the per-person files — see
  `jira-split/README.md` (map `Issue Id → Issue Id`, `Parent Id → Parent`).
- The self-hosted OpenProject seed (`op_*.rb`) builds the equivalent board (see
  the top-level `README.md`).
