---
name: Commercial buckets are additive
description: Domain rule separating baseline project terms from optional configured commercial buckets.
---

Baseline commercial terms are inherent to the project and are not stored as a commercial bucket. A time entry classified as baseline has no bucket; buckets represent optional additions such as change-order terms. Most projects will never have buckets.

**Why:** Commercial buckets are created by users in project configuration. Treating baseline as a bucket or seeding client-specific buckets in code duplicates and contradicts that configuration.

**How to apply:** Only show bucket classification for projects with configured buckets or an explicit classification requirement. Represent “Baseline SOW” as no bucket, and never create client/project commercial terms in a migration.

Calendar-derived time is subject to the same explicit classification rule as manually entered time. Prompt for a bucket on required projects rather than automatically assigning an active bucket, including bulk imports and merged events.

**Why:** An automatic bucket choice could misclassify contractual work, while a calendar flow without a choice cannot satisfy a required project's server validation.

**How to apply:** Carry the user's selection with each calendar entry (or the explicit merged entry), and leave optional projects unbucketed unless a bucket is deliberately selected.