-- Lock all local inputs used by preflight before checking, preventing races with
-- edits, archive operations, role/owner changes and another import.
LOCK TABLE projects, tenants, clients, commercial_buckets, project_allocations,
 users, tenant_users, roles, project_epics, project_stages, project_workstreams,
 project_engagements, project_planner_connections, background_jobs, assignment_import_runs, assignment_import_rows IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE cfg jsonb; errors jsonb; r record; run_id varchar; old_row jsonb; new_row jsonb; v jsonb;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 SELECT jsonb_agg(to_jsonb(e)) INTO errors FROM pg_temp.co_exceptions() e;
 IF errors IS NOT NULL THEN RAISE EXCEPTION 'Import blocked: %', errors; END IF;
 IF EXISTS(SELECT 1 FROM assignment_import_runs WHERE project_id=cfg->>'projectId' AND package_key=cfg->>'packageKey') THEN
   RAISE NOTICE 'Identical manifest already applied: no writes, no repeated shifts';
   RETURN;
 END IF;
 run_id := gen_random_uuid()::text;
 INSERT INTO assignment_import_runs(id,tenant_id,project_id,package_key,manifest,operator_reference)
 VALUES(run_id,cfg->>'tenantId',cfg->>'projectId',cfg->>'packageKey',cfg,cfg->>'operatorReference');
 FOR r IN SELECT * FROM co_rows ORDER BY source_key LOOP
   SELECT to_jsonb(a) INTO old_row FROM project_allocations a WHERE id=r.allocation_id;
   IF r.action='insert' THEN
     v := r.mapping->'values';
     INSERT INTO project_allocations(id,tenant_id,project_id,commercial_bucket_id,person_id,role_id,resource_name,
       project_epic_id,project_stage_id,project_workstream_id,task_description,hours,pricing_mode,
       rack_rate,billing_rate,cost_rate,week_number,planned_start_date,planned_end_date,notes,last_edited_at)
     VALUES(r.allocation_id,cfg->>'tenantId',cfg->>'projectId',r.bucket_id,v->>'person_id',v->>'role_id',v->>'resource_name',
       v->>'project_epic_id',v->>'project_stage_id',v->>'project_workstream_id',v->>'task_description',
       (v->>'hours')::numeric,v->>'pricing_mode',(v->>'rack_rate')::numeric,(v->>'billing_rate')::numeric,
       (v->>'cost_rate')::numeric,(v->>'week_number')::integer,r.new_start,r.new_end,v->>'notes',now());
   ELSIF r.action='update' THEN
     UPDATE project_allocations SET commercial_bucket_id=r.bucket_id,
       planned_start_date=r.new_start, planned_end_date=r.new_end,
       last_edited_at=CASE WHEN planned_start_date IS DISTINCT FROM r.new_start OR planned_end_date IS DISTINCT FROM r.new_end
         THEN now() ELSE last_edited_at END
       WHERE id=r.allocation_id AND project_id=cfg->>'projectId' AND tenant_id=cfg->>'tenantId';
   END IF;
   SELECT to_jsonb(a) INTO STRICT new_row FROM project_allocations a WHERE id=r.allocation_id;
   INSERT INTO assignment_import_rows VALUES(run_id,r.source_key,r.allocation_id,r.action,old_row,new_row);
 END LOOP;
END $$;
SELECT * FROM co_preview ORDER BY source_key;
