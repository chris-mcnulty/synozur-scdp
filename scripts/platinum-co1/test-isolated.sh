#!/usr/bin/env bash
set -euo pipefail
# Never uses DATABASE_URL or NEON_DATABASE_URL. A disposable local PostgreSQL
# server runs for the lifetime of this shell; fixture schema is exported fresh.
dir=$(mktemp -d /tmp/platinum-co-test.XXXXXX)
trap 'pg_ctl -D "$dir/db" stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
initdb -D "$dir/db" -A trust >/dev/null
pg_ctl -D "$dir/db" -l "$dir/server.log" -o '-k /tmp -p 55432' start >/dev/null
npx drizzle-kit export --dialect postgresql --schema shared/schema.ts > "$dir/schema.sql"
psql -h /tmp -p 55432 -U runner -d postgres -v ON_ERROR_STOP=1 -f "$dir/schema.sql" > "$dir/schema.log" 2>&1
psql -h /tmp -p 55432 -U runner -d postgres -v ON_ERROR_STOP=1 -f migrations/0048_assignment_commercial_buckets.sql >> "$dir/schema.log" 2>&1
npx tsx tests/platinum-co1.integration.ts
