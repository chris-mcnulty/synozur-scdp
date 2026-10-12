#!/usr/bin/env bash
set -euo pipefail
# No application credentials. Export current schema into disposable local server.
dir=$(mktemp -d /tmp/guardrails-test.XXXXXX)
trap 'pg_ctl -D "$dir/db" stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
initdb -D "$dir/db" -A trust >/dev/null
pg_ctl -D "$dir/db" -l "$dir/server.log" -o '-k /tmp -p 55433' start >/dev/null
npx drizzle-kit export --dialect postgresql --schema shared/schema.ts > "$dir/schema.sql"
psql -h /tmp -p 55433 -U runner -d postgres -v ON_ERROR_STOP=1 -f "$dir/schema.sql" > "$dir/schema.log" 2>&1
npx tsx scripts/ai-guardrails/test.ts
