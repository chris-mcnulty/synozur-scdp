---
name: Planner conflict policy
description: Mandatory last-write-wins behavior for Planner task status synchronization.
---

Planner’s timestamp-based last-write-wins resolution is mandatory for every
tenant. A newer Planner edit, especially completion, must update the local
assignment through a sync write and must not result in an outbound Planner
status patch. A newer local human edit remains eligible to update Planner.

**Why:** A rollout exception that allowed legacy push-always behavior could
reopen a Planner task after someone had completed it remotely.

**How to apply:** Do not add a tenant-level opt-out or a compatibility fallback
that changes a remote conflict winner into a local outbound write. Any new
Planner sync trigger should resolve the same timestamp conflict before sending
an update.