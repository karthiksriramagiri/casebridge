#!/usr/bin/env python3
"""Import the firms' case management workbooks into public.invoice_cases.

Each workbook holds one sheet per invoice — INV-1 … INV-9 — and each sheet
one row per case, with the status that decides whether it counts toward the
order. That workbook is what the firm is invoiced against, so it is the
source of truth for delivery; ghl_leads.invoice_code disagrees with it in
both directions and is not used here.

Usage:
    python3 scripts/import-case-workbooks.py \\
        lhp="~/Downloads/LHP Case Management.xlsx" \\
        jm="~/Downloads/JM Case Management.xlsx"

    # see what would change without writing
    python3 scripts/import-case-workbooks.py --dry-run lhp="..."

Re-running is safe: each sheet replaces its own invoice's rows for that firm
and touches nothing else, so a workbook can be re-exported and re-imported as
often as the numbers move.
"""

import os
import re
import sys
import json
import urllib.error
import urllib.request

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required:  python3 -m pip install openpyxl")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Sheet column order, which is identical across every sheet in both workbooks.
COL_NAME, COL_PHONE, COL_EMAIL, COL_DOL, COL_SIGNED, COL_DAYS, COL_STATUS = range(7)
COL_FIRM_NOTES, COL_CB_NOTES = 7, 8

STATUS = {
    "e-signed": "e_signed",
    "esigned": "e_signed",
    "e signed": "e_signed",
    "replacement": "replacement",
    "disqualified": "disqualified",
}


def load_env():
    """Read .env.local the way the app does — no dependency on a dotenv lib."""
    path = os.path.join(ROOT, ".env.local")
    env = {}
    if not os.path.exists(path):
        sys.exit(f"No .env.local at {path}")
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


ENV = load_env()
BASE = ENV.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not BASE or not KEY:
    sys.exit("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local")


def rest(method, path, body=None, headers=None):
    url = f"{BASE}/rest/v1/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode()
        if "invoice_cases" in detail and ("does not exist" in detail or "schema cache" in detail):
            sys.exit(
                "The invoice_cases table does not exist yet.\n"
                "Run supabase/migration_invoice_cases.sql in the Supabase SQL editor first."
            )
        sys.exit(f"{method} {path} failed: {err.code} {detail}")


def canonical_code(raw):
    """"INV - 9", "INV-9", "inv 9" all name the same invoice."""
    m = re.search(r"(\d+)", str(raw or ""))
    return f"INV-{int(m.group(1))}" if m else None


def clean_phone(value):
    if value is None:
        return None
    # openpyxl hands back numbers as floats: 5307824396.0
    digits = re.sub(r"\D", "", str(value).split(".")[0])
    return digits or None


def clean_date(value):
    if value is None or value == "":
        return None
    text = str(value)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", text)
    return m.group(0) if m else None


def clean_int(value):
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None


def text(value):
    if value is None:
        return None
    # Workbook names carry non-breaking spaces from copy-paste.
    s = str(value).replace("\xa0", " ").strip()
    return s or None


def read_sheet(ws):
    rows = []
    for i, raw in enumerate(ws.iter_rows(values_only=True), start=1):
        if i == 1 or not any(c not in (None, "") for c in raw):
            continue
        cell = lambda idx: raw[idx] if idx < len(raw) else None
        signed = clean_date(cell(COL_SIGNED))
        name = text(cell(COL_NAME))
        if not signed or not name:
            # A row with no name or no sign-up date is a stray note, not a case.
            continue
        status_raw = str(text(cell(COL_STATUS)) or "e_signed").lower()
        rows.append({
            "full_name": name,
            "phone": clean_phone(cell(COL_PHONE)),
            "email": text(cell(COL_EMAIL)),
            "date_of_loss": clean_date(cell(COL_DOL)),
            "signed_on": signed,
            "days_until_closed": clean_int(cell(COL_DAYS)),
            "status": STATUS.get(status_raw, status_raw.replace(" ", "_").replace("-", "_")),
            "firm_notes": text(cell(COL_FIRM_NOTES)),
            "casebridge_notes": text(cell(COL_CB_NOTES)),
            "sheet_row": i,
        })
    return rows


def main():
    args = [a for a in sys.argv[1:]]
    dry = "--dry-run" in args
    pairs = [a for a in args if "=" in a]
    if not pairs:
        sys.exit(__doc__)

    firms = rest("GET", "firms?select=id,slug,name")
    by_slug = {f["slug"]: f for f in firms}

    total_written = 0
    for pair in pairs:
        slug, path = pair.split("=", 1)
        slug = slug.strip().lower()
        path = os.path.expanduser(path.strip())
        firm = by_slug.get(slug)
        if not firm:
            sys.exit(f"No firm with slug '{slug}'. Known: {', '.join(sorted(by_slug))}")
        if not os.path.exists(path):
            sys.exit(f"No workbook at {path}")

        print(f"\n{firm['name']}  ({slug})  {os.path.basename(path)}")
        wb = openpyxl.load_workbook(path, data_only=True)
        for ws in wb.worksheets:
            code = canonical_code(ws.title)
            if not code:
                print(f"  {ws.title:10} skipped — no invoice number in the sheet name")
                continue
            rows = read_sheet(ws)
            # Only a signed case is a delivered case. A replacement was swapped
            # for another and a disqualification was never deliverable.
            live = sum(1 for r in rows if r["status"] == "e_signed")
            print(f"  {code:8} {len(rows):4} rows  {live:4} signed", end="")
            if dry:
                print("   (dry run)")
                continue

            # Replace this invoice's rows rather than merging: the workbook is
            # the whole truth for its own sheet, and a case deleted there must
            # disappear here too.
            rest("DELETE", f"invoice_cases?firm_id=eq.{firm['id']}&invoice_code=eq.{code}")
            payload = [dict(r, firm_id=firm["id"], invoice_code=code) for r in rows]
            for i in range(0, len(payload), 500):
                rest("POST", "invoice_cases", payload[i:i + 500],
                     {"Prefer": "return=minimal"})
            total_written += len(payload)
            print("   written")

    print(f"\n{'Would write' if dry else 'Wrote'} {total_written} rows.")


if __name__ == "__main__":
    main()
