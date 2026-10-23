# Per-person CSV import files (3-level WBS)

`jira-wbs.csv` split into one file per team member. The hierarchy is
**Epic (module) → User Story (function) → Task (sub-task)**. Each member owns
whole modules, so every file is self-contained — all parent links resolve inside
the file. Everyone imports their own file into **LPS — Legal Platform Scrum**.

| File | Member | Epics | Stories | Tasks |
|------|--------|------:|--------:|------:|
| `rath.csv`          | Rath Samrith  | 1 | 5  | 25 |
| `chandy-moeun.csv`  | Chandy Moeun  | 1 | 5  | 25 |
| `mai-samorn.csv`    | Mai Samorn    | 2 | 10 | 50 |
| `chhun-senghak.csv` | Chhun Senghak | 3 | 15 | 75 |
| `chhim-kimheng.csv` | Chhim Kimheng | 2 | 10 | 50 |
| `hort-ranut.csv`    | Hort Ranut    | 1 | 5  | 25 |
| **Total** | | **10** | **50** | **250** |

Each user story has exactly **5 tasks** (one per board column), so the ≥5-tasks
rule is met and all five columns fill evenly (50 tasks per column overall).

## Columns in each file
`Issue Id`, `Issue Type`, `Summary`, `Parent Id`, `Epic Name`, `Assignee`,
`Status`, `Sprint`, `Story Points`, `Due Date`, `Labels`.

The hierarchy is carried by **`Issue Id`** + **`Parent Id`** (each row's immediate
parent): Story → Epic and Sub-task → Story.

## How to import one file (team-managed LPS)
1. LPS board → **⋯ → Import issues (CSV)** (or Settings → System → External
   System Import → CSV), upload your file, select project **LPS**.
2. Map **`Issue Id` → Issue Id** and **`Parent Id` → Parent** — this links all
   three levels in one go.
3. Map **`Status`** values to the five board columns, and map **`Assignee`** to
   your Jira account.
4. `Story Points` → Story point estimate; `Sprint` → Sprint; `Due Date` → Due
   date; `Labels` → Labels.

> Because the import creates rows top-down and `Parent Id` references earlier
> rows, keep the row order as generated (Epic, then its Stories, then their
> Sub-tasks).

## Note on accounts
The site has no **Mai Samorn** or **Chhim Kimheng** account yet (and two accounts
both display "Hort ranut"). Invite those two to LPS before importing their files,
or their issues import unassigned. See `../JIRA_PUSH.md` for the accountId map.

The full plan in one file is `../jira-wbs.csv`; the automated API push is
`../jira_push.py`.
