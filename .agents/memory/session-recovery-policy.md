---
name: Session recovery policy
description: Why endpoint authorization failures must not trigger reloads or destroy otherwise-valid sessions.
---

Treat an endpoint's 401 as a request to validate authentication, not proof that the user's session expired. Preserve saved credentials on network/service validation failures. Revalidate and retry in place with a bound; do not use a full-page reload as recovery.

**Why:** A missing authentication header on a polling monitor caused valid admins to repeatedly validate and reload the same defective request; transient validation failures also turned a service problem into loss of login. The product requirement distinguishes recoverable outages from confirmed expiration.

**How to apply:** Keep HTTP status information available for recovery decisions. Only explicit auth-endpoint rejection should revoke a saved session. Keep already-authenticated pages mounted during validation; when no user has been verified, show a retry state rather than granting protected access or treating every outage as expiration.
