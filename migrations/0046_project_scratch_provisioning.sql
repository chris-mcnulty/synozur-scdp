ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS scratch_creation_key varchar(100),
  ADD COLUMN IF NOT EXISTS m365_provisioning jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_tenant_scratch_creation_key
  ON projects (tenant_id, scratch_creation_key)
  WHERE scratch_creation_key IS NOT NULL;