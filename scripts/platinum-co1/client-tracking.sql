-- Optional unassigned RAIDD companion. Uses the existing import-run ledger;
-- no production schema changes. Called in the same transaction as assignments.
CREATE FUNCTION pg_temp.co_client_exceptions() RETURNS TABLE(source_key text, exception text)
LANGUAGE plpgsql AS $$
DECLARE cfg jsonb; items jsonb; r jsonb; run assignment_import_runs;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 items := coalesce(cfg->'clientTracking','[]'::jsonb);
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN
   RETURN QUERY SELECT '*'::text,'clientTracking must be an array'; RETURN;
 END IF;
 IF jsonb_array_length(items)=0 THEN RETURN; END IF;
 IF cfg->>'clientTrackingReviewed' IS DISTINCT FROM 'true' THEN
   RETURN QUERY SELECT '*'::text,'Explicit client tracking approval required';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x GROUP BY x->>'id' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) x GROUP BY x->>'sourceKey' HAVING count(*)>1) THEN
   RETURN QUERY SELECT '*'::text,'Duplicate client tracking ID or source key';
 END IF;
 SELECT * INTO run FROM assignment_import_runs
 WHERE project_id=cfg->>'projectId' AND package_key=(cfg->>'packageKey')||'-client-tracking';
 IF run.id IS NOT NULL THEN
   IF run.tenant_id IS DISTINCT FROM cfg->>'tenantId'
   OR run.manifest->'plan' IS DISTINCT FROM cfg OR run.rolled_back_at IS NOT NULL THEN
     RETURN QUERY SELECT '*'::text,'Client tracking manifest changed or run rolled back';
   END IF;
   IF jsonb_typeof(run.manifest->'afterImages') IS DISTINCT FROM 'array' THEN
     RETURN QUERY SELECT '*'::text,'Client tracking audit images missing'; RETURN;
   END IF;
   IF jsonb_array_length(run.manifest->'afterImages')<>jsonb_array_length(items) THEN
     RETURN QUERY SELECT '*'::text,'Client tracking audit count mismatch';
   END IF;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF r - ARRAY['id','sourceKey','type','title','dueDate','description','ownerId','assigneeId'] <> '{}'::jsonb
   OR coalesce(r->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   OR coalesce(r->>'sourceKey','')=''
   OR coalesce(r->>'title','')=''
   OR coalesce(r->>'description','')=''
   OR coalesce(r->>'type','') NOT IN ('decision','dependency','action_item')
   OR coalesce(r->>'dueDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR r->>'ownerId' IS NOT NULL OR r->>'assigneeId' IS NOT NULL
   OR NOT (r ? 'ownerId' AND r ? 'assigneeId')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'sources') s WHERE s->>'key'=r->>'sourceKey')
   OR r->>'sourceKey' IN ('G5','G6','recovery-May-June','baseline-excluded','July-contributed') THEN
     RETURN QUERY SELECT r->>'sourceKey','Invalid or out-of-scope unassigned client tracking row';
   END IF;
   IF run.id IS NULL THEN
     IF EXISTS(SELECT 1 FROM raidd_entries WHERE id=r->>'id') THEN
       RETURN QUERY SELECT r->>'sourceKey','Client tracking ID already exists';
     END IF;
   ELSIF NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(run.manifest->'afterImages') image
     JOIN raidd_entries e ON e.id=image->>'id'
     WHERE e.id=r->>'id' AND e.tenant_id=cfg->>'tenantId' AND e.project_id=cfg->>'projectId'
       AND to_jsonb(e)=image
   ) THEN
     RETURN QUERY SELECT r->>'sourceKey','Client tracking entry changed or missing since apply';
   END IF;
 END LOOP;
END $$;

CREATE FUNCTION pg_temp.co_client_apply() RETURNS void LANGUAGE plpgsql AS $$
DECLARE cfg jsonb; r jsonb; errors jsonb; images jsonb;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 IF jsonb_array_length(coalesce(cfg->'clientTracking','[]'::jsonb))=0 THEN RETURN; END IF;
 LOCK TABLE raidd_entries, assignment_import_runs IN SHARE ROW EXCLUSIVE MODE;
 SELECT jsonb_agg(to_jsonb(e)) INTO errors FROM pg_temp.co_client_exceptions() e;
 IF errors IS NOT NULL THEN RAISE EXCEPTION 'Client import blocked: %',errors; END IF;
 IF EXISTS(SELECT 1 FROM assignment_import_runs WHERE project_id=cfg->>'projectId'
   AND package_key=(cfg->>'packageKey')||'-client-tracking') THEN RETURN; END IF;
 IF cfg->>'plannerMaintenanceConfirmed' IS DISTINCT FROM 'true'
 OR cfg->>'inventoryReviewed' IS DISTINCT FROM 'true'
 OR coalesce(cfg->>'operatorReference','')='' THEN
   RAISE EXCEPTION 'Client import requires operator, inventory and maintenance approval';
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(cfg->'clientTracking') LOOP
   INSERT INTO raidd_entries(id,tenant_id,project_id,type,title,description,status,owner_id,assignee_id,due_date)
   VALUES(r->>'id',cfg->>'tenantId',cfg->>'projectId',r->>'type',r->>'title',
     r->>'description','open',NULL,NULL,(r->>'dueDate')::date);
 END LOOP;
 SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) INTO images
 FROM raidd_entries e WHERE e.id IN (SELECT x->>'id' FROM jsonb_array_elements(cfg->'clientTracking') x);
 INSERT INTO assignment_import_runs(id,tenant_id,project_id,package_key,manifest,operator_reference)
 VALUES(gen_random_uuid()::text,cfg->>'tenantId',cfg->>'projectId',
   (cfg->>'packageKey')||'-client-tracking',jsonb_build_object('plan',cfg,'afterImages',images),
   cfg->>'operatorReference');
END $$;

CREATE FUNCTION pg_temp.co_client_rollback() RETURNS void LANGUAGE plpgsql AS $$
DECLARE cfg jsonb; run assignment_import_runs; image jsonb; fk record; referenced boolean;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 IF jsonb_array_length(coalesce(cfg->'clientTracking','[]'::jsonb))=0 THEN RETURN; END IF;
 LOCK TABLE raidd_entries, assignment_import_runs IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO STRICT run FROM assignment_import_runs WHERE project_id=cfg->>'projectId'
   AND tenant_id=cfg->>'tenantId' AND package_key=(cfg->>'packageKey')||'-client-tracking' FOR UPDATE;
 IF run.manifest->'plan' IS DISTINCT FROM cfg OR run.rolled_back_at IS NOT NULL
 OR cfg->>'plannerMaintenanceConfirmed' IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'Client rollback requires unchanged manifest and maintenance approval';
 END IF;
 IF EXISTS(SELECT 1 FROM project_planner_connections WHERE project_id=cfg->>'projectId' AND sync_enabled)
 OR EXISTS(SELECT 1 FROM background_jobs WHERE type LIKE 'planner%' AND status IN ('queued','running','retrying')
   AND (tenant_id=cfg->>'tenantId' OR payload->>'projectId'=cfg->>'projectId')) THEN
   RAISE EXCEPTION 'Client rollback blocked by active Planner connection/jobs';
 END IF;
 -- Check all rows before deleting any; reject even internal/self references.
 FOR image IN SELECT value FROM jsonb_array_elements(run.manifest->'afterImages') LOOP
   IF NOT EXISTS(SELECT 1 FROM raidd_entries e WHERE e.id=image->>'id' AND to_jsonb(e)=image) THEN
     RAISE EXCEPTION 'Client rollback refused: % changed or missing',image->>'id';
   END IF;
   FOR fk IN SELECT c.conrelid::regclass AS tbl, att.attname AS col,
       cardinality(c.conkey) AS key_count
     FROM pg_constraint c JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1]
     WHERE c.contype='f' AND c.confrelid='raidd_entries'::regclass LOOP
     IF fk.key_count<>1 THEN RAISE EXCEPTION 'Review composite RAIDD reference before rollback'; END IF;
     EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',fk.tbl);
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',fk.tbl,fk.col)
       INTO referenced USING image->>'id';
     IF referenced THEN RAISE EXCEPTION 'Client rollback refused: % referenced by %',image->>'id',fk.tbl; END IF;
   END LOOP;
   -- These logical self references have no database FK in the application schema.
   IF EXISTS(SELECT 1 FROM raidd_entries WHERE parent_entry_id=image->>'id'
     OR converted_from_id=image->>'id' OR superseded_by_id=image->>'id') THEN
     RAISE EXCEPTION 'Client rollback refused: logical reference to %',image->>'id';
   END IF;
 END LOOP;
 DELETE FROM raidd_entries WHERE id IN
   (SELECT x->>'id' FROM jsonb_array_elements(run.manifest->'afterImages') x);
 UPDATE assignment_import_runs SET rolled_back_at=now() WHERE id=run.id;
END $$;
