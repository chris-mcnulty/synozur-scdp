---
name: Invoice payment amount defaults
description: The operator expects full tax-inclusive payment amounts to be suggested without manual entry, without changing saved receipts.
---
Client invoice payment forms should suggest the full invoice total, including tax, when no receipt amount is present.

**Why:** The operator reported that accepting tax-inclusive payments was insufficient because the full amount still had to be entered manually. The expected behavior is a ready-to-use amount, not just accepting that amount after typing it.

**How to apply:** Apply the suggestion to empty payment forms, including an already-selected payment status. Preserve recorded cash amounts (including explicit zero), deliberate nonempty overrides, and saved payment dates. A UI suggestion is not permission to backfill or correct historical production receipts automatically.
