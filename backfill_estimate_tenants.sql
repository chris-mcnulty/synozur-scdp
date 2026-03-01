-- Backfill orphaned estimates: resolve tenant_id from project
UPDATE estimates e
SET tenant_id = p.tenant_id
FROM projects p
WHERE e.project_id = p.id
  AND e.tenant_id IS NULL
  AND p.tenant_id IS NOT NULL;

-- Backfill orphaned estimates: resolve tenant_id from client (fallback)
UPDATE estimates e
SET tenant_id = c.tenant_id
FROM clients c
WHERE e.client_id = c.id
  AND e.tenant_id IS NULL
  AND c.tenant_id IS NOT NULL;

-- Verify: show any remaining orphans
SELECT e.id, e.name, e.tenant_id, e.client_id, e.project_id
FROM estimates e
WHERE e.tenant_id IS NULL;
