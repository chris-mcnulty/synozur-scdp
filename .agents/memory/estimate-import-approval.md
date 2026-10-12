---
name: Estimate import approval boundary
description: Production estimate imports require a separately approved costed preview, not just approval to build the importer.
---
Production estimate import preparation is not permission to execute. Resolve role splits and allowance costing first; show unresolved costs as unresolved rather than invented margins.

**Why:** The AI Guardrails request explicitly separates package preparation from production execution, with existing role costs but no source effort allocations for multi-role tasks.

**How to apply:** Require separate approval of the exact reconciled preview. Do not substitute development execution, equal role splits or a percentage-of-billing cost fallback. Always-salaried role costs need explicit policy review because direct-cost exclusion and loaded effort costs are different measures.

Do not repeatedly ask for approval of unchanged costing decisions. When the user
requests executable SQL after approving the plan, prepare the operator handoff;
the user controls production execution. Do not ask them to merge the task merely
to access the handoff.

**Why:** The user explicitly objected to repeated preview/merge requests when the
agent could not execute production writes and merging would end the task session.

**How to apply:** Deliver the scripts and expected results within the active session,
state the write effects once, and distinguish preparation from actual execution.

Deliver operator files as a direct archive attachment, not only as download links
embedded in an HTML report.

**Why:** The user reported that the HTML handoff's embedded downloads were unusable
in their preview, despite the payload bytes having been validated.

**How to apply:** Attach the ZIP itself and check archived files match the tested
originals. Treat report rendering and file download usability as separate checks.
