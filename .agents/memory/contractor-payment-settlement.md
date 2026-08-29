---
name: Contractor payment settlement invariants
description: Accounting and concurrency rules for matching outbound contractor payments to invoices.
---

Payment allocation must be serialized at the invoice level. Validate the aggregate of all payments only after locking affected invoices, and never let concurrent matches independently consume the same remaining balance.

**Why:** Payment-level validation alone is raceable when two payments are matched to one invoice at the same time, allowing both requests to observe the same outstanding amount.

**How to apply:** Any create, replace, or removal of allocations must lock all affected invoices in a deterministic order before calculating balances and changing invoice state.

For a fully settled invoice, the paid date is the latest payment date among its covering allocations. Editing or removing an allocated payment must recompute both paid status and paid date.

**Why:** The audit date represents when the invoice became fully covered, not when an admin happened to edit the allocation.

**How to apply:** Recalculate invoice settlement from the complete allocation set whenever allocations or allocated payment dates change.