---
name: Entra certificate rotation
description: Check both non-secret configuration and secrets when a rotated certificate is not used in production.
---
Check production non-secret environment settings as well as production secrets during certificate rotation. Use live callback errors to establish which certificate is actually selected; secret-existence inventory alone is not sufficient.

**Why:** Updating a thumbprint secret left a separately configured production environment thumbprint unchanged, and real sign-in callbacks continued identifying the expired certificate after a successful publish.

**How to apply:** A certificate thumbprint is a public identifier and can be inspected and updated with environment-variable tools. Keep the private key in secret settings and never inspect its value. Confirm the matching public certificate is registered in Entra, republish after correcting configuration, and verify live sign-in before declaring recovery.
