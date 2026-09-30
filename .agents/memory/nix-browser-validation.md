---
name: Nix browser validation lifecycle
description: Environment constraints for reliable Puppeteer validation in this Replit project.
---

Puppeteer browser checks must use Chromium already supplied by the Nix environment rather than assume Puppeteer downloaded its preferred browser revision. When a check launches the app through an npm command, treat the command and its descendants as one process group and stop the group during cleanup.

**Why:** Puppeteer can be installed while its private browser cache is empty. Also, stopping only the npm parent leaves the TypeScript server child alive, causing an otherwise-finished validation command to hang. The newest Chromium in the Nix store may fail to expose a debugging endpoint after an environment restart even when an older installed version launches successfully; cold server initialization may exceed a short browser-test readiness window.

**How to apply:** For any new real-browser suite, resolve an environment-provided Chromium executable (while allowing an explicit executable override) and guarantee process-group cleanup on both success and failure. If a browser fails to launch after an environment restart, try an installed Chromium version via the explicit override before changing application code; allow sufficient time for a cold server startup.