---
name: Status report period scoping
description: How Status PPTX "Key Accomplishments" are scoped to the reporting period and why PM context leads
---

# Status report "Key Accomplishments" period scoping

The Status PPTX export builds accomplishments from the project's planned
task/assignment list grouped by epic. Two recurring failure modes:

1. **Pre-period work bleeds in.** A "completed" predicate is sound only if it
   requires an EXPLICIT completion date bounded on BOTH ends within
   `[periodStart, periodEnd]`. Do not fall back to the task's start date for the
   "done" date, and exclude undated "completed" tasks — both let earlier-phase
   work resurface as current accomplishments.
   **Why:** allocation `allocEnd` is itself defaulted to `plannedEndDate || allocStart`,
   so any predicate using `allocEnd` silently admits start-dated/undated work.
   Capture a raw `plannedEnd` (no start fallback) for completion checks.

2. **Operational work isn't in the plan.** Real period work (hands-on support,
   vendor/partner escalations, recurring standups/reviews) lives in time-entry
   descriptions and the PM's head, not the planned deliverables — so the AI
   restates generic epic titles. Mitigation: time entries are already strictly
   period-scoped (TEAM ACTIVITY), and the PM CONTEXT field (`pmNarrative`) is the
   designed channel for this. The prompt treats PM CONTEXT as the PRIMARY source.

**How to apply:** if you touch the accomplishments predicate, keep the count
header (`priorActivities`) and the compact list (`compactCompleted`) using the
SAME predicate — they drifted once and produced a mismatched count vs. list.
