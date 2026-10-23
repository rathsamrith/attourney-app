# Pushing the plan into Jira

The Attest (Project 6) plan is a **3-level WBS**:
**Epic (module) → User Story (function) → Task (sub-task)** —
**10 Epics, 50 User Stories, 250 Tasks**. Each user story has 5 tasks (one per
board column), so all five Scrum columns hold 50 tasks each.

Two ways to load it:

- **CSV import** (no code) — `jira-wbs.csv` (whole plan) or the per-person files
  in `jira-split/`. See `jira-split/README.md`.
- **API push** (`jira_push.py`) — creates everything over the REST API, linked
  and assigned, and moves each sub-task into its column.

`jira_push.py` uses the standard library only — no `pip install`.

## 1. Get an API token
https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**.

## 2. Set the connection (do NOT commit these)

```sh
export JIRA_BASE_URL="https://hortranut1111.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="<the token>"
export JIRA_PROJECT_KEY="KAN"
```

PowerShell uses `$env:NAME = "..."`.

## 3. Map members to Jira accounts
Edit `MEMBER_ACCOUNT_IDS` at the top of `jira_push.py`. Emails are hidden by
privacy on this site, so the script maps by **accountId**. Discovered so far:

| CSV name | accountId |
|---|---|
| Rath | `712020:9b91ce6c-dbb7-433f-9568-3cfdedf2ee68` |
| Chandy Moeun | `712020:352984ab-b821-45ec-8f55-8d1b93415e73` |
| Chhun Senghak | `712020:243c0a25-ea27-46de-a719-212c153bc21b` |
| Hort Ranut | `712020:c974e22e-b20c-41da-90a2-e01e7c720cbb` |
| **Mai Samorn** | *no account yet — invite, then fill in* |
| **Chhim Kimheng** | *no account yet — invite, then fill in* |

Members with an empty id import **unassigned** (with a warning); everything else
still gets created.

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

## Sprints first (KAN is a Kanban project)
KAN ("Project Management") is Kanban, which has no sprints by default. Before the
`Sprint` column means anything:
1. **Project settings → Features → enable "Sprints"** (and "Backlog").
2. Open **Backlog**, click **Create sprint**, then **••• → Edit sprint** and set
   name / start / end / goal for each of the four — use the exact names in
   `jira-sprints.csv` so the issue import matches them:
   `Sprint 1 - Data Collection & Design`, `Sprint 2 - Implementation`,
   `Sprint 3 - Testing`, `Sprint 4 - Deployment & Submission`.

Then importing the issues (with the `Sprint` column mapped) drops each story into
the matching sprint.

## Board columns (one-time)
A board column is backed by a workflow status. For the five named columns to
exist, set the KAN board's columns to **Data Collection Backlog · Design ·
Implementation · Testing · Deployment** (Board → ⋯ → Configure board → Columns)
before running. Missing columns are reported and those sub-tasks stay in the
default status; add the column and re-run.

## Alternatives
- **CSV import** of `jira-wbs.csv` or the per-person files — see
  `jira-split/README.md` (map `Issue Id → Issue Id`, `Parent Id → Parent`).
- The self-hosted OpenProject seed (`op_*.rb`) builds the equivalent board (see
  the top-level `README.md`).
