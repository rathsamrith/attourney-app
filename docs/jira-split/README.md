# Per-person CSV import files

`jira-import.csv` split into one file per team member. Each file contains the
**module(s) that person leads** (Epic rows) and the **tasks assigned to them**
(Task rows). Everyone imports their own file into the **LPS — Legal Platform
Scrum** project.

| File | Member | Epics | Tasks |
|------|--------|------:|------:|
| `mai-samorn.csv`    | Mai Samorn    | 2 | 5 |
| `hort-ranut.csv`    | Hort Ranut    | 1 | 5 |
| `chhun-senghak.csv` | Chhun Senghak | 3 | 5 |
| `chhim-kimheng.csv` | Chhim Kimheng | 2 | 5 |
| `rath.csv`          | Rath Samrith  | 1 | 5 |
| `chandy-moeun.csv`  | Chandy Moeun  | 1 | 5 |
| **Total** | | **10** | **30** |

## How to import one file
1. LPS board → **⋯ → Import issues (CSV)** (or Settings → System → External
   System Import → CSV), upload your file, select project **LPS**.
2. Map the columns — headers already match Jira's fields. In a **team-managed**
   project map **Epic Link → Parent**.
3. On the **Assignee** step, map your name to your Jira account.
4. Map the `Status` values to the five board columns.

## Import order (matters for 4 tasks)
A task links to its Epic only if that Epic already exists in the project. Most
tasks (26/30) sit in their own owner's module, so they link within the same file.
**Four tasks belong to a module a teammate leads** — import the owner's file
first, or just set the Epic/Parent on these four afterward (one click each):

| Task | In file | Needs Epic from |
|------|---------|-----------------|
| Implement real face-match adapter | `rath.csv` | `mai-samorn.csv` (Vendor Integrations) |
| Collect EN/KM localization strings & glossary | `chandy-moeun.csv` | `chhim-kimheng.csv` (Docket & Notifications) |
| Write release notes & user documentation | `chandy-moeun.csv` | `chhim-kimheng.csv` (Docket & Notifications) |
| Deploy backend container with migrate + seed | `chhim-kimheng.csv` | `hort-ranut.csv` (Infrastructure & CI/CD) |

If one person imports everything, this order resolves all links:
**mai-samorn → hort-ranut → chhun-senghak → chhim-kimheng → rath → chandy-moeun**.

## Note on accounts
The Jira site currently has no **Mai Samorn** or **Chhim Kimheng** account (and
two accounts both display "Hort ranut"). Invite those two to LPS before importing
their files, or their issues import unassigned — see `../JIRA_PUSH.md` for the
account mapping. The combined single-file version is `../jira-import.csv`.
