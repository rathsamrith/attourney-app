# Pushing the plan into Jira

`jira_push.py` creates the Attest (Project 6) delivery plan in a Jira Cloud
project over the REST API v3 — **10 Epics, 30 Tasks**, each Task linked to its
Epic, assigned to its owner, with due date, labels and story points. It reads
`jira-import.csv` as the single source of truth and is **idempotent** (it
searches by summary before creating, so re-runs don't duplicate issues).

Standard library only — no `pip install` needed.

## 1. Get an API token
https://id.atlassian.com/manage-profile/security/api-tokens → **Create API token**.

## 2. Set the connection (do NOT commit these)

```sh
export JIRA_BASE_URL="https://your-team.atlassian.net"
export JIRA_EMAIL="you@example.com"
export JIRA_API_TOKEN="<the token>"
export JIRA_PROJECT_KEY="ATT"        # an existing Jira project key
```

PowerShell:

```powershell
$env:JIRA_BASE_URL  = "https://your-team.atlassian.net"
$env:JIRA_EMAIL     = "you@example.com"
$env:JIRA_API_TOKEN = "<the token>"
$env:JIRA_PROJECT_KEY = "ATT"
```

## 3. Map members to real Jira accounts
Edit `MEMBER_EMAILS` at the top of `jira_push.py` so each of the six names points
to that person's email in **your** Jira site. The `@attest.local` addresses are
placeholders and won't resolve. Unresolved members are left unassigned (with a
warning) rather than failing the run.

## 4. Run

```sh
python docs/jira_push.py --dry-run     # preview: what would be created
python docs/jira_push.py               # create for real
```

## 5. Scrum board — the five columns (do this once, in the UI)
A Jira board's columns are backed by workflow **statuses**. To get the five
required columns, use a **team-managed** Scrum project and set its board columns
to exactly these names **before** running the script:

1. **Data Collection Backlog**
2. **Design**
3. **Implementation**
4. **Testing**
5. **Deployment**

Board → **⋯ → Configure board → Columns** → add/rename until the five match.
Each column creates a status of the same name. Then run `jira_push.py`: it moves
every Task into its column (6 tasks each), so all five columns end up with ≥5.

If a column/status is missing, the script warns and leaves that task in the
default status (everything else still gets created); add the column and re-run
(it's idempotent).

## What it handles automatically
- Resolves each assignee's `accountId` from their email.
- Detects the project's Epic/Task issue-type ids.
- Detects the Epic→Task link style (`parent` for team-managed, Epic Link field
  for company-managed) and the Story Points field id.
- **Board columns:** transitions each Task into its status (the 5 columns) and
  prints how many landed in each.
- **Best-effort sprints:** if the project has an Agile board, it creates the four
  sprints and moves each Task into its sprint. If there's no board, it skips
  sprints with a warning (everything else still gets created).

## Fastest alternative: CSV import
Jira's **CSV importer** (`jira-import.csv`) maps the `Status` column to the five
board columns during import and can create the statuses for you — no UI column
setup needed. The `op_*.rb` scripts build the identical 5-column board in the
self-hosted OpenProject instance (see the top-level `README.md`).

## Importing `jira-import.csv` into the LPS project

Target project: **LPS — Legal Platform Scrum** (team-managed Scrum) on
`https://hortranut1111.atlassian.net`.

1. **Settings (gear) → System → External System Import → CSV** (site-admin), or
   from a board: **⋯ → Import issues (CSV)**.
2. Upload `docs/jira-import.csv`, select project **LPS**.
3. Map the columns: `Issue Type`, `Summary`, `Epic Name`, `Epic Link`,
   `Assignee`, `Status`, `Sprint`, `Story Points`, `Due Date`, `Labels`.
4. On the **Assignee** step the wizard lists each distinct name — map each to the
   right Jira account:

   | CSV name | Jira account (accountId) |
   |---|---|
   | Rath | Rath Samrith (`712020:9b91ce6c-dbb7-433f-9568-3cfdedf2ee68`) |
   | Chandy Moeun | Chandy Moeun (`712020:352984ab-b821-45ec-8f55-8d1b93415e73`) |
   | Chhun Senghak | "Senghak chhun" (`712020:243c0a25-ea27-46de-a719-212c153bc21b`) |
   | Hort Ranut | "Hort ranut" (`712020:c974e22e-b20c-41da-90a2-e01e7c720cbb`) |
   | **Mai Samorn** | *no account yet* — invite them, or map to the 2nd "Hort ranut" (`712020:2e0d9693-4f64-4078-b177-dba3d72e7698`) |
   | **Chhim Kimheng** | *no account yet* — invite them first |

   > The site currently has only 5 accounts (two both display "Hort ranut"), so
   > **Mai Samorn** and **Chhim Kimheng** don't exist. Invite them to the LPS
   > project before importing for a clean six-person board, or leave them
   > unmapped (those tasks import unassigned) and assign later.
5. Map `Status` values to the five board columns (create them if prompted).
6. Run the import. Afterwards, open the board and confirm the five columns each
   hold their tasks.

For a fully automated push (no wizard) use `jira_push.py` once Mai & Kimheng have
accounts — see the top of this file.
