#!/bin/bash
set -e
npm install
npm run db:push -- --force
npx tsx scripts/validate-agent-card.ts
npx tsx scripts/check-route-integrity.ts
