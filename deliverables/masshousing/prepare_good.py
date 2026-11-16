"""Offline GOOD-only extraction and reconciliation; no application or DB imports."""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "attached_assets/MassHousing_Price_Model_-_Final_(Internal)_1794793880988.xlsx"
OUT = Path(__file__).parent
cached = openpyxl.load_workbook(SOURCE, read_only=True, data_only=True)
formulas = openpyxl.load_workbook(SOURCE, read_only=True, data_only=False)
rate = cached["Rates"]["C2"].value
hours_per_day = cached["Rates"]["C3"].value
assert (rate, hours_per_day, cached["Rates"]["C4"].value) == (300, 8, 2400)
assert formulas["Rates"]["C4"].value == "=C2*C3"

headers = ["Epic Name", "Stage Name", "Workstream", "Week", "Description",
           "Category", "Resource", "Base Hours", "Factor", "Rate",
           "Size", "Complexity", "Confidence", "Comments"]
rows = []
phases = defaultdict(lambda: {"activities": 0, "days": 0, "hours": 0, "fees": 0})
excluded = []
for n, values in enumerate(cached["Effort"].iter_rows(min_row=2, values_only=True), 2):
    phase, activity, role, days, _, _, fee, _, _, basis = values
    assert formulas["Effort"][f"G{n}"].value == f"=D{n}*Rates!$C$4"
    effort_formula = formulas["Effort"][f"D{n}"].value
    if isinstance(effort_formula, str) and effort_formula.startswith("="):
        match = re.fullmatch(r"=Volumes!(B\d+)\*Volumes!(B\d+)", effort_formula)
        assert match, effort_formula
        assert days == cached["Volumes"][match[1]].value * cached["Volumes"][match[2]].value
    assert fee == days * rate * hours_per_day
    if days == 0:
        excluded.append({"source_row": n, "activity": activity})
        continue
    assert days > 0
    hours = days * hours_per_day
    comment = f"INTERNAL ONLY; Source: Effort row {n}, GOOD; Basis: {basis}; {days:g} Synozur days x 8 hours/day; delivery cost unresolved unless approved role cost is matched."
    rows.append([phase, "", "", "", activity, "", role, f"{hours:g}", "1",
                 "300", "small", "small", "high", comment])
    p = phases[phase]
    p["activities"] += 1
    p["days"] += days
    p["hours"] += hours
    p["fees"] += fee

assert len(rows) == 28 and len(excluded) == 3
for n in range(2, 7):
    phase = cached["Summary"][f"A{n}"].value
    assert phases[phase]["fees"] == cached["Summary"][f"B{n}"].value
assert sum(p["days"] for p in phases.values()) == cached["Summary"]["B8"].value == 46.5
assert sum(p["hours"] for p in phases.values()) == 372
assert sum(p["fees"] for p in phases.values()) == cached["Summary"]["B7"].value == 111600
assert cached["Rates"]["C5"].value == cached["Summary"]["B9"].value == 55000
assert formulas["Summary"]["B9"].value == "=Rates!$C$5"
assert formulas["Summary"]["B10"].value == "=B7+B9"
assert cached["Summary"]["B10"].value == 166600
rows.append(["OUTCOME fixed fee", "", "", "",
             "OUTCOME strategy workstream - fixed-fee allowance (not delivery effort)",
             "", "OUTCOME", "1", "1", "55000", "small", "small", "high",
             "INTERNAL ONLY; Source: Rates C5 / Summary B9; one synthetic billing unit, NOT one delivery hour; source timing: weeks 1-8; partner confirmation remains pending; OUTCOME effort and cost are unresolved, not zero."])
rows = [[re.sub(r"[\r\n]+", " ", str(v)) for v in row] for row in rows]
target = OUT / "MassHousing-Good-estimate.csv"
with target.open("w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(rows)
with target.open(newline="", encoding="utf-8") as f:
    parsed = list(csv.reader(f, strict=True))
assert parsed == [headers] + rows
assert len(target.read_text().splitlines()) == 30
assert all(len(row) == 14 for row in parsed)
assert sum(float(row[7]) * float(row[9]) for row in rows) == 166600
assert sum(float(row[7]) for row in rows) == 373
report = {
    "source": SOURCE.name, "output": target.name,
    "synozur_activities": 28, "allowance_rows": 1,
    "synozur_days": 46.5, "genuine_delivery_hours": 372,
    "synthetic_billing_units": 1, "importer_hours_total": 373,
    "synozur_fees": 111600, "outcome_allowance": 55000, "total": 166600,
    "phases": dict(phases), "excluded_zero_effort_rows": excluded,
    "validation": "Source cached values and GOOD effort formulas reconciled; CSV round-trip passed. No live import or database access.",
}
(OUT / "reconciliation.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
