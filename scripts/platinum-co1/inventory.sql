-- READ ONLY. Replace BOTH placeholders with operator-verified production IDs.
-- Execute against the database used by the published server/db.ts connection.
BEGIN READ ONLY;
SELECT t.id,t.name AS tenant_name,p.id AS project_id,p.name AS project_name,c.name AS client_name
FROM tenants t JOIN projects p ON p.tenant_id=t.id JOIN clients c ON c.id=p.client_id
WHERE t.id='REVIEWED_TENANT_ID' AND p.id='REVIEWED_PROJECT_ID';
SELECT to_jsonb(a) AS expected FROM project_allocations a
WHERE tenant_id='REVIEWED_TENANT_ID' AND project_id='REVIEWED_PROJECT_ID' ORDER BY id;
SELECT to_jsonb(b) AS expected FROM commercial_buckets b
WHERE tenant_id='REVIEWED_TENANT_ID' AND project_id='REVIEWED_PROJECT_ID' ORDER BY id;
SELECT e.* FROM project_epics e JOIN projects p ON p.id=e.project_id WHERE p.tenant_id='REVIEWED_TENANT_ID' AND p.id='REVIEWED_PROJECT_ID';
SELECT s.* FROM project_stages s JOIN project_epics e ON e.id=s.epic_id JOIN projects p ON p.id=e.project_id WHERE p.tenant_id='REVIEWED_TENANT_ID' AND p.id='REVIEWED_PROJECT_ID';
SELECT w.* FROM project_workstreams w JOIN projects p ON p.id=w.project_id WHERE p.tenant_id='REVIEWED_TENANT_ID' AND p.id='REVIEWED_PROJECT_ID';
SELECT id,name,is_active,is_assignable FROM users WHERE primary_tenant_id='REVIEWED_TENANT_ID';
SELECT id,user_id,status FROM tenant_users WHERE tenant_id='REVIEWED_TENANT_ID';
SELECT e.* FROM project_engagements e WHERE tenant_id='REVIEWED_TENANT_ID' AND project_id='REVIEWED_PROJECT_ID';
SELECT id,name FROM roles WHERE tenant_id='REVIEWED_TENANT_ID';
SELECT s.* FROM planner_task_sync s JOIN project_allocations a ON a.id=s.allocation_id WHERE a.tenant_id='REVIEWED_TENANT_ID' AND a.project_id='REVIEWED_PROJECT_ID';
ROLLBACK;
