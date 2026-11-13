#!/usr/bin/env python3
"""Push the Attest (Project 6) 3-level WBS into a Jira Cloud project over the
REST API v3: Epic (module) -> Story (function) -> Sub-task (task). Reads
docs/jira-wbs.csv, creates every issue in parent order, links the hierarchy,
assigns owners, sets due dates / labels / story points, and moves each sub-task
into its board column.

Standard library only -- no pip install required.

Setup
-----
1. API token: https://id.atlassian.com/manage-profile/security/api-tokens
2. export JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY
3. Fill MEMBER_ACCOUNT_IDS (preferred) or MEMBER_EMAILS below.
4. python docs/jira_push.py            (add --dry-run to preview)

Idempotent: searches by summary before creating, so re-runs won't duplicate.
"""
import os, sys, csv, json, base64, urllib.request, urllib.parse, urllib.error

BASE    = os.environ.get("JIRA_BASE_URL", "").rstrip("/")
EMAIL   = os.environ.get("JIRA_EMAIL", "")
TOKEN   = os.environ.get("JIRA_API_TOKEN", "")
PROJECT = os.environ.get("JIRA_PROJECT_KEY", "")

# Preferred: map each CSV assignee name to its Jira accountId on the target site
# (kai-dev). Fill these in (see JIRA_PUSH.md for the lookup curl). Leave "" to
# import that member's issues unassigned.
MEMBER_ACCOUNT_IDS = {
    "Rath":          "",
    "Chandy Moeun":  "",
    "Chhun Senghak": "",
    "Hort Ranut":    "",
    "Mai Samorn":    "",
    "Chhim Kimheng": "",
}
# Fallback: name -> email (used only when the accountId above is empty).
MEMBER_EMAILS = {}

CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jira-wbs.csv")
DRY_RUN  = "--dry-run" in sys.argv
BOARD_COLUMNS = ["Data Collection Backlog", "Design", "Implementation", "Testing", "Deployment"]


def api(method, path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{EMAIL}:{TOKEN}".encode()).decode())
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()}") from None


def die(msg):
    print("ERROR:", msg); sys.exit(1)


def resolve_accounts(names):
    out = {}
    for name in names:
        aid = MEMBER_ACCOUNT_IDS.get(name, "")
        if not aid and MEMBER_EMAILS.get(name):
            hits = api("GET", "/rest/api/3/user/search?query=" + urllib.parse.quote(MEMBER_EMAILS[name]))
            if hits:
                aid = hits[0]["accountId"]
        out[name] = aid or None
        print(f"  - {name:<15} -> {out[name] or '(unassigned)'}")
    return out


def issue_type_ids():
    data = api("GET", f"/rest/api/3/issue/createmeta/{PROJECT}/issuetypes")
    types = data.get("issueTypes") or data.get("values") or []
    by = {t["name"].lower(): t["id"] for t in types}
    sub = next((i for n, i in by.items() if "sub" in n and "task" in n), None)
    ids = {"Epic": by.get("epic"), "Story": by.get("story") or by.get("task"), "Sub-task": sub}
    for k, v in ids.items():
        if not v:
            die(f"project {PROJECT} has no '{k}' issue type (found {list(by)})")
    return ids


def type_fields(type_id):
    d = api("GET", f"/rest/api/3/issue/createmeta/{PROJECT}/issuetypes/{type_id}")
    return d.get("fields") or d.get("values") or []


def find_field(fields, *names):
    want = [n.lower() for n in names]
    return next((f.get("id") for f in fields if f.get("name", "").lower() in want), None)


def find_issue(summary):
    jql = f'project = "{PROJECT}" AND summary ~ "\\"{summary}\\""'
    res = api("POST", "/rest/api/3/search", {"jql": jql, "maxResults": 5, "fields": ["summary"]})
    for i in res.get("issues", []):
        if i["fields"]["summary"].strip() == summary.strip():
            return i["key"]
    return None


def create(fields):
    if DRY_RUN:
        print("    [dry-run] create", fields["issuetype"]["id"], fields["summary"])
        return "DRY-000"
    return api("POST", "/rest/api/3/issue", {"fields": fields})["key"]


def transition_to(key, status_name):
    if DRY_RUN or key == "DRY-000" or not status_name:
        return
    try:
        trs = api("GET", f"/rest/api/3/issue/{key}/transitions").get("transitions", [])
        t = next((x for x in trs if x.get("to", {}).get("name", "").lower() == status_name.lower()), None)
        if t:
            api("POST", f"/rest/api/3/issue/{key}/transitions", {"transition": {"id": t["id"]}})
    except Exception as e:
        print(f"  ! transition {key} -> {status_name}:", e)


def sprint_support():
    try:
        boards = api("GET", "/rest/agile/1.0/board?projectKeyOrId=" + PROJECT).get("values", [])
    except Exception:
        return None, {}
    if not boards:
        return None, {}
    bid = boards[0]["id"]
    existing = {}
    try:
        start = 0
        while True:
            page = api("GET", f"/rest/agile/1.0/board/{bid}/sprint?startAt={start}")
            for s in page.get("values", []):
                existing[s["name"]] = s["id"]
            if page.get("isLast", True):
                break
            start += len(page.get("values", []))
    except Exception:
        pass
    return bid, existing


def ensure_sprint(bid, existing, name):
    if name in existing or DRY_RUN:
        return existing.get(name)
    try:
        s = api("POST", "/rest/agile/1.0/sprint", {"name": name, "originBoardId": bid})
        existing[name] = s["id"]; return s["id"]
    except Exception as e:
        print("  ! create sprint:", e); return None


def move_to_sprint(sid, key):
    if DRY_RUN or not sid or key == "DRY-000":
        return
    try:
        api("POST", f"/rest/agile/1.0/sprint/{sid}/issue", {"issues": [key]})
    except Exception as e:
        print("  ! sprint move:", e)


def main():
    for var, val in [("JIRA_BASE_URL", BASE), ("JIRA_EMAIL", EMAIL),
                     ("JIRA_API_TOKEN", TOKEN), ("JIRA_PROJECT_KEY", PROJECT)]:
        if not val:
            die(f"{var} is not set")
    if not os.path.exists(CSV_PATH):
        die(f"cannot find {CSV_PATH}")

    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))

    print(f"Jira: {BASE} project={PROJECT} rows={len(rows)} {'(DRY RUN)' if DRY_RUN else ''}")
    print("Resolving assignees...")
    acct = resolve_accounts(sorted({r["Assignee"] for r in rows if r["Assignee"]}))
    itypes = issue_type_ids()
    print("Issue types:", itypes)
    sp_field = find_field(type_fields(itypes["Story"]), "Story Points", "Story point estimate")
    bid, sprints = sprint_support()

    key_by_id = {}       # CSV Issue Id -> created Jira key
    placed = {c: 0 for c in BOARD_COLUMNS}

    def base_fields(r, itype):
        f = {"project": {"key": PROJECT}, "summary": r["Summary"], "issuetype": {"id": itype}}
        aid = acct.get(r["Assignee"])
        if aid:
            f["assignee"] = {"accountId": aid}
        if r.get("Due Date"):
            f["duedate"] = r["Due Date"]
        if r.get("Labels"):
            f["labels"] = [x for x in r["Labels"].split() if x]
        return f

    for level, itype_name in [("Epic", "Epic"), ("Story", "Story"), ("Sub-task", "Sub-task")]:
        print(f"\n{itype_name}s:")
        for r in rows:
            if r["Issue Type"] != itype_name:
                continue
            existing = find_issue(r["Summary"])
            if existing:
                key_by_id[r["Issue Id"]] = existing
                print(f"  = exists: {r['Summary'][:55]} ({existing})")
                continue
            f = base_fields(r, itypes[itype_name])
            if r.get("Parent Id"):
                parent = key_by_id.get(r["Parent Id"])
                if parent:
                    f["parent"] = {"key": parent}
            if itype_name == "Story" and sp_field and r.get("Story Points"):
                try:
                    f[sp_field] = float(r["Story Points"])
                except ValueError:
                    pass
            key = create(f)
            key_by_id[r["Issue Id"]] = key
            print(f"  + {r['Summary'][:55]} ({key})")
            if itype_name == "Story" and bid and r.get("Sprint"):
                move_to_sprint(ensure_sprint(bid, sprints, r["Sprint"]), key)
            if itype_name == "Sub-task" and r.get("Status") in placed:
                transition_to(key, r["Status"]); placed[r["Status"]] += 1

    print("\nBoard columns (sub-tasks moved into each):")
    for c in BOARD_COLUMNS:
        print(f"  {c:<24} {placed[c]}")
    print("\nDone.")


if __name__ == "__main__":
    main()
