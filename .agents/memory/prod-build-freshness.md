---
name: Verify prod build freshness before claiming prod behavior
description: Production deployment can lag the codebase; curl the live endpoint and compare responses before asserting deployed behavior.
---

The rule: before verifying or claiming any behavior "in production," curl the live endpoint and compare the actual response against what the current code would produce. If the live response contains strings that no longer exist in the codebase, the deployed build is stale.

**Why:** During MCP bearer-auth verification, production returned a legacy error body that had been removed from the code — the RFC 6750 fix existed locally but was never republished. Log searches for the new log prefixes returned nothing, which looked like "feature broken" but actually meant "feature not deployed."

**How to apply:** Use getDeploymentInfo() for the real production URL (custom domains may exist; don't trust $REPLIT_DOMAINS). Grep the codebase for distinctive strings in the live response. Task agents cannot trigger a publish — if prod is stale, propose a republish follow-up instead of trying to force verification.
