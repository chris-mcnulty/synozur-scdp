#!/usr/bin/env bash
# Test the exact generated console scripts against a disposable local database.
# Uses no application connection strings or credentials.
set -euo pipefail
dir=$(mktemp -d /tmp/guardrails-delivery.XXXXXX)
trap 'pg_ctl -D "$dir/db" stop >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT
initdb -D "$dir/db" -A trust >/dev/null
pg_ctl -D "$dir/db" -l "$dir/server.log" -o '-k /tmp -p 55434' start >/dev/null
createdb -h /tmp -p 55434 -U runner neondb
db=(psql -h /tmp -p 55434 -U runner -d neondb -v ON_ERROR_STOP=1 -At)
npx drizzle-kit export --dialect postgresql --schema shared/schema.ts > "$dir/schema.sql"
"${db[@]}" -f "$dir/schema.sql" > "$dir/schema.log" 2>&1
node - <<'JS' > "$dir/seed.sql"
const fs=require('fs');
const r=JSON.parse(fs.readFileSync('generated-artifacts/ai-guardrails/execution-review.json'));
const q=x=>x===null?'NULL':typeof x==='boolean'?String(x):"'"+String(x).replaceAll("'","''")+"'";
console.log(`INSERT INTO tenants(id,name,slug) VALUES(${[r.tenant.id,r.tenant.name,r.tenant.slug].map(q)});`);
for(const role of r.roles) console.log(`INSERT INTO roles(id,name,tenant_id,default_cost_rate,default_rack_rate,is_always_salaried) VALUES(${[role.id,role.name,role.tenant_id,role.default_cost_rate,role.default_rack_rate,role.is_always_salaried].map(q)});`);
JS
"${db[@]}" -f "$dir/seed.sql" > /dev/null
out=generated-artifacts/ai-guardrails
# Same-session rerun exercises temp-function reuse as well as idempotency.
"${db[@]}" -f "$out/01-import.sql" -f "$out/01-import.sql" > "$dir/import.log" 2>&1
"${db[@]}" -f "$out/02-verify.sql" | tee "$dir/readback.txt"
grep -q '|112|13059.36|4244292.00|3147333.00|1096959.00|' "$dir/readback.txt"
grep -q '|t|t$' "$dir/readback.txt"
"${db[@]}" -f "$out/03-rollback-only-if-needed.sql" > "$dir/rollback.log" 2>&1
"${db[@]}" -f "$out/04-confirm-rollback.sql" | tee "$dir/rolledback.txt"
grep -q '|0|0$' "$dir/rolledback.txt"
echo 'Exact delivered scripts passed isolated apply, same-session rerun, readback and rollback.'
