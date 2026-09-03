#!/bin/bash
set -euo pipefail

# Reconcile lockfile changes from the merged task without spending the merge
# window on audit/funding network requests. Prefer the local npm cache because
# the main workspace normally already contains nearly all dependencies.
npm install --prefer-offline --no-audit --no-fund
npm run db:push -- --force
npx tsx scripts/validate-agent-card.ts
npx tsx scripts/check-route-integrity.ts
