#!/usr/bin/env python3
"""Push the Attest (Project 6) delivery plan into a Jira Cloud project over the
REST API v3. Reads docs/jira-import.csv as the single source of truth, creates
the Epics and Tasks, links each Task to its Epic, assigns every item to its
owner, and sets due dates, labels and story points. Sprint assignment is
best-effort (needs an Agile board).

Standard library only -- no pip install required.

Setup
-----
1. Create an API token: https://id.atlassian.com/manage-profile/security/api-tokens
2. Export the four environment variables below.
3. Fill MEMBER_EMAILS with each member's real email in YOUR Jira site.
4. Run:  python docs/jira_push.py           (add --dry-run to preview)

Idempotent: it searches by summary before creating, so re-runs won't duplicate.
"""
import os
import sys
import csv
import json
import base64
import urllib.request
import urllib.parse
import urllib.error

# ---------------------------------------------------------------- configuration
BASE    = os.environ.get("JIRA_BASE_URL", "").rstrip("/")   # https://your.atlassian.net
EMAIL   = os.environ.get("JIRA_EMAIL", "")
TOKEN   = os.environ.get("JIRA_API_TOKEN", "")
PROJECT = os.environ.get("JIRA_PROJECT_KEY", "")            # e.g. ATT

# CSV assignee display name  ->  that person's email in your Jira site.
# The @attest.local addresses are placeholders; replace with real accounts.
MEMBER_EMAILS = {
    "Rath":          "rath@attest.local",
    "Mai Samorn":    "mai@attest.local",
    "Chhun Senghak": "senghak@attest.local",
    "Chandy Moeun":  "chandy@attest.local",
    "Chhim Kimheng": "kimheng@attest.local",
    "Hort Ranut":    "ranut@attest.local",
}

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jira-import.csv")
DRY_RUN  = "--dry-run" in sys.argv

# ---------------------------------------------------------------------- helpers
def _auth_header():
    raw = f"{EMAIL}:{TOKEN}".encode()
    return "Basic " + base64.b64encode(raw).decode()

def api(method, path, body=None):
    """Call the Jira REST API. `path` starts with /rest/..."""
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", _auth_header())
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from None

def die(msg):
    print("ERROR:", msg)
    sys.exit(1)

# ----------------------------------------------------------------- discovery
def resolve_account_ids():
    ids = {}
    for name, mail in MEMBER_EMAILS.items():
        hits = api("GET", "/rest/api/3/user/search?query=" + urllib.parse.quote(mail))
        match = next((u for u in hits if u.get("emailAddress", "").lower() == mail.lower()), None)
        match = match or (hits[0] if hits else None)
        if not match:
            print(f"  ! no Jira user for {name} <{mail}> -- tasks will be unassigned")
            ids[name] = None
        else:
            ids[name] = match["accountId"]
            print(f"  - {name:<15} -> {match.get('displayName','?')} ({match['accountId']})")
    return ids

def issue_type_ids():
    data = api("GET", f"/rest/api/3/issue/createmeta/{PROJECT}/issuetypes")
    types = data.get("issueTypes") or data.get("values") or []
    by_name = {t["name"].lower(): t["id"] for t in types}
    epic = by_name.get("epic")
    task = by_name.get("task") or by_name.get("story")
    if not epic or not task:
        die(f"project {PROJECT} is missing Epic/Task issue types (found: {list(by_name)})")
    return epic, task

def type_fields(type_id):
    data = api("GET", f"/rest/api/3/issue/createmeta/{PROJECT}/issuetypes/{type_id}")
    return data.get("fields") or data.get("values") or []

def find_field(all_fields, *names):
    want = [n.lower() for n in names]
    for f in all_fields:
        if f.get("name", "").lower() in want:
            return f.get("id")
    return None

# ----------------------------------------------------------------- idempotency
def find_issue(summary):
    jql = f'project = "{PROJECT}" AND summary ~ "\\"{summary}\\""'
    body = {"jql": jql, "maxResults": 5, "fields": ["summary"]}
    res = api("POST", "/rest/api/3/search", body)
    for issue in res.get("issues", []):
        if issue["fields"]["summary"].strip() == summary.strip():
            return issue["key"]
    return None

def create_issue(fields):
    if DRY_RUN:
        print(f"    [dry-run] create {fields['issuetype']['id']}: {fields['summary']}")
        return "DRY-000"
    res = api("POST", "/rest/api/3/issue", {"fields": fields})
    return res["key"]

# ----------------------------------------------------------------------- sprints
def sprint_support():
    try:
        boards = api("GET", "/rest/agile/1.0/board?projectKeyOrId=" + PROJECT).get("values", [])
    except Exception as e:
        print("  ! sprint setup skipped (no board access):", e)
        return None, {}
    if not boards:
        print("  ! no Agile board for this project -- sprints skipped")
        return None, {}
    board_id = boards[0]["id"]
    existing = {}
    try:
        start = 0
        while True:
            page = api("GET", f"/rest/agile/1.0/board/{board_id}/sprint?startAt={start}")
            for s in page.get("values", []):
                existing[s["name"]] = s["id"]
            if page.get("isLast", True):
                break
            start += len(page.get("values", []))
    except Exception as e:
        print("  ! could not list sprints:", e)
    return board_id, existing

def ensure_sprint(board_id, existing, name):
    if name in existing:
        return existing[name]
    if DRY_RUN:
        return None
    try:
        s = api("POST", "/rest/agile/1.0/sprint", {"name": name, "originBoardId": board_id})
        existing[name] = s["id"]
        return s["id"]
    except Exception as e:
        print(f"  ! could not create sprint {name!r}:", e)
        return None

def move_to_sprint(sprint_id, key):
    if DRY_RUN or not sprint_id or key == "DRY-000":
        return
    try:
        api("POST", f"/rest/agile/1.0/sprint/{sprint_id}/issue", {"issues": [key]})
    except Exception as e:
        print(f"  ! could not move {key} to sprint:", e)

# ----------------------------------------------------------------- board columns
# A Scrum board's columns are backed by workflow STATUSES. To land a task in the
# "Design" column the project must have a "Design" status and a transition to it.
# In a team-managed board you add the five columns in the UI first (see
# JIRA_PUSH.md); then this moves each task into its column.
BOARD_COLUMNS = ["Data Collection Backlog", "Design", "Implementation",
                 "Testing", "Deployment"]

def project_statuses():
    """Set of status names available on the project's issue types."""
    names = set()
    try:
        data = api("GET", f"/rest/api/3/project/{PROJECT}/statuses")
        for it in data:
            for s in it.get("statuses", []):
                names.add(s["name"])
    except Exception as e:
        print("  ! could not read project statuses:", e)
    return names

def transition_to(key, status_name):
    """Best-effort: move an issue to the named status if a direct transition exists."""
    if DRY_RUN or key == "DRY-000" or not status_name:
        return False
    try:
        trs = api("GET", f"/rest/api/3/issue/{key}/transitions").get("transitions", [])
    except Exception as e:
        print(f"  ! no transitions for {key}:", e)
        return False
    t = next((x for x in trs if x.get("to", {}).get("name", "").lower() == status_name.lower()), None)
    if not t:
        return False
    try:
        api("POST", f"/rest/api/3/issue/{key}/transitions", {"transition": {"id": t["id"]}})
        return True
    except Exception as e:
        print(f"  ! could not transition {key} -> {status_name}:", e)
        return False

# --------------------------------------------------------------------------- main
def main():
    for var, val in [("JIRA_BASE_URL", BASE), ("JIRA_EMAIL", EMAIL),
                     ("JIRA_API_TOKEN", TOKEN), ("JIRA_PROJECT_KEY", PROJECT)]:
        if not val:
            die(f"environment variable {var} is not set")
    if not os.path.exists(CSV_PATH):
        die(f"cannot find {CSV_PATH}")

    print(f"Jira: {BASE}  project={PROJECT}  {'(DRY RUN)' if DRY_RUN else ''}")
    print("Resolving assignees...")
    acct = resolve_account_ids()
    epic_type, task_type = issue_type_ids()
    print(f"Issue types: Epic={epic_type} Task={task_type}")

    tf = type_fields(task_type)
    ef = type_fields(epic_type)
    sp_field   = find_field(tf, "Story Points", "Story point estimate")
    epic_name  = find_field(ef, "Epic Name")                 # company-managed epics
    parent_ok  = find_field(tf, "Parent") == "parent"
    epic_link  = None if parent_ok else find_field(tf, "Epic Link")
    print(f"Fields: storyPoints={sp_field} epicName={epic_name} "
          f"linkMode={'parent' if parent_ok else ('epicLink:'+str(epic_link))}")

    board_id, sprints = sprint_support()

    statuses = project_statuses()
    missing_cols = [c for c in BOARD_COLUMNS if c not in statuses]
    if missing_cols:
        print("  ! board columns/statuses not found (add them in the board, see "
              "JIRA_PUSH.md): " + ", ".join(missing_cols))

    placed = {c: 0 for c in BOARD_COLUMNS}

    # read rows
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    # ---- epics ----
    epic_key = {}            # short Epic Name -> issue key
    print("\nEpics:")
    for r in rows:
        if r["Issue Type"] != "Epic":
            continue
        summary = r["Summary"]
        short = r["Epic Name"]
        key = find_issue(summary)
        if key:
            print(f"  = exists: {summary} ({key})")
        else:
            fields = {"project": {"key": PROJECT}, "summary": summary,
                      "issuetype": {"id": epic_type}}
            if r.get("Labels"):
                fields["labels"] = [l.strip() for l in r["Labels"].split() if l.strip()]
            aid = acct.get(r.get("Assignee"))
            if aid:
                fields["assignee"] = {"accountId": aid}
            if epic_name:
                fields[epic_name] = short
            key = create_issue(fields)
            print(f"  + created: {summary} ({key})")
        epic_key[short] = key

    # ---- tasks ----
    print("\nTasks:")
    for r in rows:
        if r["Issue Type"] != "Task":
            continue
        summary = r["Summary"]
        existing = find_issue(summary)
        if existing:
            print(f"  = exists: {summary} ({existing})")
            continue
        fields = {"project": {"key": PROJECT}, "summary": summary,
                  "issuetype": {"id": task_type}}
        aid = acct.get(r.get("Assignee"))
        if aid:
            fields["assignee"] = {"accountId": aid}
        if r.get("Due Date"):
            fields["duedate"] = r["Due Date"]
        if r.get("Labels"):
            fields["labels"] = [l.strip() for l in r["Labels"].split() if l.strip()]
        if sp_field and r.get("Story Points"):
            try:
                fields[sp_field] = float(r["Story Points"])
            except ValueError:
                pass
        parent_key = epic_key.get(r.get("Epic Link"))
        if parent_key:
            if parent_ok:
                fields["parent"] = {"key": parent_key}
            elif epic_link:
                fields[epic_link] = parent_key
        key = create_issue(fields)
        print(f"  + created: {summary} ({key})  epic={r.get('Epic Link')}  owner={r.get('Assignee')}")
        # sprint
        if board_id and r.get("Sprint"):
            sid = ensure_sprint(board_id, sprints, r["Sprint"])
            move_to_sprint(sid, key)
        # board column (status)
        col = r.get("Status")
        if col in placed and transition_to(key, col):
            placed[col] += 1

    print("\nBoard columns (tasks moved into each):")
    for c in BOARD_COLUMNS:
        print(f"  {c:<24} {placed[c]}")
    print("\nDone.")

if __name__ == "__main__":
    main()
