# MassHousing GOOD — internal import handoff

Import `MassHousing-Good-estimate.csv` once into a **new, empty, draft Detailed estimate**, using **Import CSV**. Do not use a Program estimate or append to an existing populated estimate. Keep referral fees and any additional markups/discounts off. Each row already has neutral factors: 1 / small / small / high.

## Reconciliation

| Phase | Genuine Synozur hours | Fee |
|---|---:|---:|
| 1 Strategy & Governance | 104 | $31,200 |
| 2 Deployment & Adoption Design | 36 | $10,800 |
| 3 Champion Program | 56 | $16,800 |
| 4 Training & Communications | 80 | $24,000 |
| 5 Execution & Measurement | 96 | $28,800 |
| Synozur subtotal | **372** | **$111,600** |
| OUTCOME fixed-fee allowance | **Unknown; not inferred** | **$55,000** |
| Total price | | **$166,600** |

Expect **29 imported line items**: 28 billable source activities in original order and five phase epics, followed by one separately labeled OUTCOME allowance epic. There are no subtotal rows. Synozur delivery is 46.5 days × 8 hours/day, at $300/hour.

The allowance uses **one synthetic Base Hours billing unit × $55,000**, not a delivery hour. The importer's combined hours will therefore show **373**, but genuine Synozur delivery remains **372 hours**. Do not use 373 for staffing, utilization, or delivery reporting. OUTCOME delivery effort and cost are unknown; source timing is weeks 1–8 and partner confirmation remains pending.

## Roles and costs

Source resource labels are preserved: Program lead; Responsible AI & governance lead; Microsoft/GCC architect; Measurement analyst; Champion & change lead; Learning lead; OUTCOME.

Preflight matches existing users or roles by name, case-insensitively. Import gives user matches precedence over role matches, so check for unintended person assignments. No tenant roster or live data was queried for this handoff.

If **Unrecognized Resources Found** appears, use **Skip (Import Anyway)** to retain unmatched labels without creating roles. Such rows have no linked user/role cost; costs remain **unresolved**, not proven zero. Do not accept tenant-default or zero costs as approved costing. Alternatively, cancel and resolve exact-name role mapping and approved costs before importing. The wizard creates roles; it does not offer mapping to differently named roles. Any deliberate mapping should retain the source role in comments and be reviewed before import.

Matched users/roles supply their stored default cost rate, while the CSV supplies the selling rate. Review these costs and salaried-role treatment before relying on margins. For OUTCOME, the $55,000 selling allowance is **not evidence of partner cost**. A matched hourly cost would be applied to just one synthetic unit and is not a valid partner-cost model unless separately approved. Do not create an OUTCOME role with invented effort or cost.

After import, verify 29 rows, no skipped-row or unmatched-epic warnings, all phase totals above, and exactly one $55,000 allowance. Confirm the total and presented price are $166,600 with no extra markup.

## Scope and validation

Stage, Workstream, Week, and Category are blank: no unsupported schedule or grouping was invented. Basis notes and source row references are in Comments. Milestones and payment schedules are **not imported**.

Three zero-GOOD-effort source rows are omitted: Champion intake and portfolio handoff (folded into Champion design per workbook), Manager toolkit and change support, and In-person delivery travel time. Optional extras, travel, negotiation levers, internal envelope checks, and Better/Best packages are excluded.

Offline checks reconciled cached values and GOOD effort formulas, validated quoting and physical lines, and executed the current server CSV parser and header mapping without application imports or database access. No live import, role creation, code modification, or database write was performed. This is **internal material**, not a client-ready proposal.
