---
name: Bulk date-shift (push out) pattern
description: How "push multiple items out together" is implemented for deliverables and assignments in Constellation
---

Constellation reschedules sets of dated rows (deliverables, resource assignments) with a
shared "anchor + delta" model, not per-row absolute dates.

The rule:
- User multi-selects rows, picks ONE anchor and a NEW date for it. The UI computes a
  day-delta from the anchor's current date to the new date, and the SAME delta is applied
  to every selected row (each row keeps its own duration).
- Backend endpoint takes `{ ids[], deltaDays }` (NOT absolute dates), shifts both
  start and end fields, skips baseline rows, enforces tenant boundary from the server
  session, and runs inside a db.transaction.

**Why:** keeping it delta-based preserves each row's duration and lets one action move a
whole phase/team in sync; sending absolute dates per row would lose that and invite
client-driven tampering.

**How to apply:** when adding a new "bulk push" surface, mirror the deliverables
bulk-shift endpoint (the canonical reference) and reuse the same delta contract. Validate
delta is a non-zero integer within a sane bound. On the client, derive the filtered/visible
list into a single shared const so "select all" and the rendered rows can never diverge.
