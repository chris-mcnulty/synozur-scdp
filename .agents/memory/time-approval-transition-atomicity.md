---
name: Time approval transition atomicity
description: Safety rule for multi-entry submission, recall, approval, and rejection transitions.
---

Approval-workflow batch transitions must validate permissions, lock state, current status, and required commercial classification after acquiring row locks, then update the exact requested set in the same transaction.

**Why:** Preflight checks outside the transaction leave a race where another workflow can lock or transition one row, causing a bulk request to silently apply only part of its selection.

**How to apply:** For any new or changed multi-entry workflow transition, lock all selected rows, validate every row, perform the conditional update, and roll back unless the returned unique ID count exactly matches the request.