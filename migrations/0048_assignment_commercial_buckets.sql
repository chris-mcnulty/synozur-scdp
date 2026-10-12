-- Optional assignment metadata, deliberately independent of time classification.
ALTER TABLE project_allocations ADD COLUMN IF NOT EXISTS commercial_bucket_id varchar
  REFERENCES commercial_buckets(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_allocations_commercial_bucket ON project_allocations(commercial_bucket_id);

CREATE OR REPLACE FUNCTION guard_assignment_commercial_bucket() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b commercial_buckets; p projects;
BEGIN
  IF NEW.commercial_bucket_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM projects WHERE id = NEW.project_id FOR SHARE;
  SELECT * INTO b FROM commercial_buckets WHERE id = NEW.commercial_bucket_id FOR SHARE;
  IF b.id IS NULL OR b.project_id <> NEW.project_id OR b.tenant_id IS DISTINCT FROM p.tenant_id
     OR NEW.tenant_id IS DISTINCT FROM p.tenant_id THEN
    RAISE EXCEPTION 'Assignment commercial bucket must belong to the same project and tenant';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT b.is_active OR b.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot select an archived commercial bucket';
    END IF;
  ELSIF NEW.commercial_bucket_id IS DISTINCT FROM OLD.commercial_bucket_id
        AND (NOT b.is_active OR b.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot select an archived commercial bucket';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assignment_commercial_bucket_guard ON project_allocations;
CREATE TRIGGER assignment_commercial_bucket_guard
  BEFORE INSERT OR UPDATE ON project_allocations
  FOR EACH ROW EXECUTE FUNCTION guard_assignment_commercial_bucket();

-- Moving a bucket or project cannot invalidate existing mappings.
CREATE OR REPLACE FUNCTION guard_mapped_bucket_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id)
     AND EXISTS (SELECT 1 FROM project_allocations WHERE commercial_bucket_id = OLD.id) THEN
    RAISE EXCEPTION 'Cannot move a mapped commercial bucket';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mapped_bucket_scope_guard ON commercial_buckets;
CREATE TRIGGER mapped_bucket_scope_guard BEFORE UPDATE ON commercial_buckets
  FOR EACH ROW EXECUTE FUNCTION guard_mapped_bucket_scope();

CREATE OR REPLACE FUNCTION guard_commercial_project_move() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id AND EXISTS
    (SELECT 1 FROM project_allocations WHERE project_id=OLD.id AND commercial_bucket_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot move a project with commercial assignment mappings';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commercial_project_move_guard ON projects;
CREATE TRIGGER commercial_project_move_guard BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION guard_commercial_project_move();

CREATE TABLE IF NOT EXISTS assignment_import_runs (
  id varchar PRIMARY KEY,
  tenant_id varchar NOT NULL REFERENCES tenants(id),
  project_id varchar NOT NULL REFERENCES projects(id),
  package_key text NOT NULL,
  manifest jsonb NOT NULL,
  operator_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  UNIQUE(project_id, package_key)
);
CREATE TABLE IF NOT EXISTS assignment_import_rows (
  run_id varchar NOT NULL REFERENCES assignment_import_runs(id),
  source_key text NOT NULL,
  allocation_id varchar NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','noop')),
  before_image jsonb,
  after_image jsonb NOT NULL,
  PRIMARY KEY(run_id, source_key),
  UNIQUE(run_id, allocation_id)
);
