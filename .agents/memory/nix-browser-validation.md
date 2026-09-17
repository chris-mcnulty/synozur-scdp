---
name: Nix browser validation lifecycle
description: Environment constraints for reliable Puppeteer validation in this Replit project.
---

Puppeteer browser checks must use Chromium already supplied by the Nix environment rather than assume Puppeteer downloaded its preferred browser revision. When a check launches the app through an npm command, treat the command and its descendants as one process group and stop the group during cleanup.

**Why:** Puppeteer can be installed while its private browser cache is empty. Also, stopping only the npm parent leaves the TypeScript server child alive, causing an otherwise-finished validation command to hang.

**How to apply:** For any new real-browser suite, resolve an environment-provided Chromium executable (while allowing an explicit executable override) and guarantee process-group cleanup on both success and failure.