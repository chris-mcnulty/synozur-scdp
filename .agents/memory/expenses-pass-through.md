---
name: Expenses are pass-through, never margin
description: Business rule — expense reimbursements must not affect profit/margin calculations anywhere
---
**Rule:** Expenses (contractor invoice expense lines, project expense reports) are client pass-through reimbursements. They must be tracked for billing reconciliation (avoid double- or missing-billing) but excluded from cost, profit, and margin in every profitability calculation. Only service/fee costs count against revenue.

**Why:** Owner stated this explicitly (Aug 2026): "if we bill a client $500 for a meeting and contractor charged us $300 for their time, our profit is $200 and margin is 40%" — pass-through parking/travel costs and their reimbursements don't change that. The older reports dashboard already followed this; the newer analytics profitability endpoints initially (wrongly) counted expense lines as cost.

**How to apply:** Any new cost/margin calculation that touches contractor_cost_invoice_lines must filter kind='service' (or exclude expense buckets from totals). Symmetrically, if reimbursed expenses appear in revenue entries, they overstate revenue/profit — watch that side too.
