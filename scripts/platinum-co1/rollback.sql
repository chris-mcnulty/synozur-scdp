LOCK TABLE project_allocations, assignment_import_runs, assignment_import_rows IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE cfg jsonb; run assignment_import_runs; r record; fk record; referenced boolean; old project_allocations;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 SELECT * INTO STRICT run FROM assignment_import_runs WHERE project_id=cfg->>'projectId'
   AND tenant_id=cfg->>'tenantId' AND package_key=cfg->>'packageKey' FOR UPDATE;
 IF run.manifest IS DISTINCT FROM cfg OR run.rolled_back_at IS NOT NULL THEN
   RAISE EXCEPTION 'Manifest differs or run already rolled back';
 END IF;
 IF cfg->>'plannerMaintenanceConfirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Planner maintenance required'; END IF;
 FOR r IN SELECT * FROM assignment_import_rows WHERE run_id=run.id ORDER BY source_key LOOP
   IF NOT EXISTS(SELECT 1 FROM project_allocations a WHERE a.id=r.allocation_id AND to_jsonb(a)=r.after_image) THEN
     RAISE EXCEPTION 'Rollback refused: % changed or missing',r.source_key;
   END IF;
   IF r.action='insert' THEN
     -- Inspect every FK, including CASCADE and SET NULL: neither may silently
     -- erase/clear a subsequent reference. Lock referencing tables first.
     FOR fk IN SELECT c.conrelid::regclass AS tbl, att.attname AS col
       FROM pg_constraint c JOIN pg_attribute att ON att.attrelid=c.conrelid AND att.attnum=c.conkey[1]
       WHERE c.contype='f' AND c.confrelid='project_allocations'::regclass LOOP
       EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',fk.tbl);
       EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',fk.tbl,fk.col) INTO referenced USING r.allocation_id;
       IF referenced THEN RAISE EXCEPTION 'Rollback refused: % referenced by %',r.source_key,fk.tbl; END IF;
     END LOOP;
     DELETE FROM project_allocations WHERE id=r.allocation_id;
   ELSIF r.action='update' THEN
     old := jsonb_populate_record(NULL::project_allocations,r.before_image);
     UPDATE project_allocations SET commercial_bucket_id=old.commercial_bucket_id,
       planned_start_date=old.planned_start_date,planned_end_date=old.planned_end_date,
       last_edited_at=old.last_edited_at,last_edited_by=old.last_edited_by
       WHERE id=r.allocation_id;
   END IF;
 END LOOP;
 UPDATE assignment_import_runs SET rolled_back_at=now() WHERE id=run.id;
END $$;
