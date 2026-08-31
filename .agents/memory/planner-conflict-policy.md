---
name: Planner conflict policy
description: Mandatory last-write-wins behavior for Planner task status synchronization.
---

Planner last-write-wins resolution is mandatory for every tenant. A newer
Planner edit, especially completion, must update the local assignment through
a sync write and must not result in an outbound Planner status patch. A newer
local human edit remains eligible to update Planner.

**Why:** A rollout exception that allowed legacy push-always behavior could
reopen a Planner task after someone had completed it remotely. Microsoft Graph
Planner tasks may also omit `lastModifiedDateTime`; treating that omission as
an automatic local win caused the same regression.

**How to apply:** Do not add a tenant-level opt-out or a compatibility fallback
that changes a remote conflict winner into a local outbound write. When Graph
omits its modification timestamp, use the last successful sync as the boundary:
only a local human edit after that sync may win; otherwise differing remote
state wins. Every sync trigger must apply the same rule before sending updates.