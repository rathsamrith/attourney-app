# Per-person CSV files (balanced 3-level WBS)

`jira-wbs.csv` split into one file per team member — each person's **worklist**.
The hierarchy is **Epic (module) → User Story (function) → Task (sub-task)**, and
user stories are **distributed evenly across all six members and the four
sprints** (not by module). Each file is self-contained — it includes the epics
its stories reference, plus those stories and their sub-tasks — so parent links
resolve within the file.

| File | Member | Stories | Tasks | per sprint (S1·S2·S3·S4) |
|------|--------|--------:|------:|:--|
| `rath.csv`          | Rath Samrith  | 9 | 45 | 3·2·2·2 |
| `mai-samorn.csv`    | Mai Samorn    | 9 | 45 | 2·3·2·2 |
| `chhun-senghak.csv` | Chhun Senghak | 8 | 40 | 2·2·2·2 |
| `chandy-moeun.csv`  | Chandy Moeun  | 8 | 40 | 2·2·2·2 |
| `chhim-kimheng.csv` | Chhim Kimheng | 8 | 40 | 2·2·2·2 |
| `hort-ranut.csv`    | Hort Ranut    | 8 | 40 | 2·2·2·2 |
| **Total** | | **50** | **250** | 65·65·60·60 |

Each story still has exactly **5 tasks** (one per board column), so overall each of
the five columns holds 50 tasks.

## Which file to import
- **For the real Jira project, import the combined `../jira-wbs.csv` once.** It
  creates all 10 epics, 50 stories and 250 sub-tasks, links them, and assigns the
  whole team in a single run.
- The per-member files here **share epics** (the same module appears in several
  members' files, because their stories are spread across modules). So **don't
  import all of them into the same project** — the epics would duplicate. Use them
  as each person's worklist, or import a single one into a personal sandbox.

## Columns
`Issue Id`, `Issue Type`, `Summary`, `Parent Id`, `Epic Name`, `Assignee`,
`Status`, `Sprint`, `Story Points`, `Due Date`, `Labels`. The hierarchy is carried
by `Issue Id` + `Parent Id` (Story → Epic, Sub-task → Story).

## Import mapping (team-managed KAN)
Map `Issue Id → Issue Id` and `Parent Id → Parent`; map `Status` → the five board
columns and `Assignee` → each Jira account. Create the four sprints first (KAN is
Kanban — enable the Sprints feature), then map `Sprint → Sprint`. See
`../JIRA_PUSH.md`.

## Note on accounts
The site has no **Mai Samorn** or **Chhim Kimheng** account yet; invite them to KAN
so their items assign. The automated API push is `../jira_push.py`.
