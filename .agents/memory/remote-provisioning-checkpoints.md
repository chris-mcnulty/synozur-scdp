---
name: Remote provisioning checkpoints
description: Durable retry rule for workflows that create Microsoft or other remote resources before local mappings.
---

Persist every remote resource identifier immediately after the remote API confirms creation and before any dependent local database write. A retry must consume that checkpoint, restore any missing local mapping, and continue from the failed step rather than creating another remote resource.

**Why:** A remote create can succeed while the following local mapping write fails or the request times out. A final-row upsert alone cannot prevent duplicate remote Teams, channels, plans, or similar resources.

**How to apply:** Give the originating local create operation a tenant-scoped idempotency key, persist a running request record, checkpoint remote IDs step-by-step, store structured partial results, and expose a project-scoped retry that repairs mappings from those checkpoints.