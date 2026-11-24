---
name: Product release identity
description: Why product releases follow the changelog rather than scaffold or restart dates.
---
Product release identity follows the changelog's major.minor feature-release convention.
Package and agent/protocol versions are independent. A restart must not manufacture
a new product release date or identity.

**Why:** Release alignment found three conflicting conventions: product changelog
versions, an unchanged scaffold package version and a date-based About identity
rewritten on startup. A fixed source identity makes release communications stable.

**How to apply:** Choose feature increments from the latest product changelog,
keep runtime identity and public documentation consistent, and distinguish source
integration from production deployment. Do not rewrite unrelated historical records.
