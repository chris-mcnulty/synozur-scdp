---
name: Planner production verification safety
description: Completion metadata makes reopening completed Planner tasks unsuitable for fully reversible verification tests.
---
Do not describe a completed Planner task's temporary progress change as fully reversible.

**Why:** Microsoft documents `completedDateTime` as read-only and set when `percentComplete` becomes 100. Reopening a completed task and completing it again restores its progress but replaces its completion timestamp; the original timestamp cannot be restored through a normal task update. This matters even when the PATCH changes only progress and leaves planned start/due dates untouched.

**How to apply:** Prefer an approved test on a currently unfinished task. If a completed task must be used, explicitly disclose the completion-history effect before obtaining approval. A previous approval given under a no-date-change or fully-reversible description is insufficient for that newly discovered consequence. Use fresh ETags for writes, preserve concurrent human edits, and distinguish status restoration from full metadata restoration.

Reference: https://learn.microsoft.com/en-us/graph/api/resources/plannertask?view=graph-rest-1.0
