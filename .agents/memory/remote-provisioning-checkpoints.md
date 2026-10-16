---
name: Remote provisioning checkpoints
description: Durable retry rule for workflows that create Microsoft or other remote resources before local mappings.
---

Persist every remote resource identifier immediately after the remote API confirms creation and before any dependent local database write. A retry must consume that checkpoint, restore any missing local mapping, and continue from the failed step rather than creating another remote resource.

**Why:** A remote create can succeed while the following local mapping write fails or the request times out. A final-row upsert alone cannot prevent duplicate remote Teams, channels, plans, or similar resources.

**How to apply:** Give the originating local create operation a tenant-scoped idempotency key, persist a running request record, checkpoint remote IDs step-by-step, store structured partial results, and expose a project-scoped retry that repairs mappings from those checkpoints.

For ambiguous remote creation without a returned ID, commit a connection-specific correlation identity before the remote call, outside the transaction that might roll back afterward. Prefer delaying creation when remote discovery fails over assuming the remote resource does not exist.

**Why:** A database transaction cannot undo Graph acceptance. Resource and callback URL alone do not prove ownership because separate connections can legitimately share both; adopting their subscription would mix notification verification identities.

**How to apply:** Reconcile using the persisted identity and exact target before retrying a create. Retain that identity across response loss and local persistence failure; require a complete successful remote lookup before concluding that a new create is safe.