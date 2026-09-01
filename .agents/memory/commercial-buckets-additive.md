---
name: Commercial buckets are additive
description: Domain rule separating baseline project terms from optional configured commercial buckets.
---

Baseline commercial terms are inherent to the project and are not stored as a commercial bucket. A time entry classified as baseline has no bucket; buckets represent optional additions such as change-order terms. Most projects will never have buckets.

**Why:** Commercial buckets are created by users in project configuration. Treating baseline as a bucket or seeding client-specific buckets in code duplicates and contradicts that configuration.

**How to apply:** Only show bucket classification for projects with configured buckets or an explicit classification requirement. Represent “Baseline SOW” as no bucket, and never create client/project commercial terms in a migration.