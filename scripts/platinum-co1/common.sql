-- Included by build.ts inside ONE transaction. Temporary objects never persist.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE co_rows ON COMMIT DROP AS
SELECT s->>'key' AS parent_key, s->>'ref' AS source_ref, s->>'title' AS source_title,
       a AS mapping, a->>'sourceKey' AS source_key,
       a->>'allocationId' AS allocation_id, a->>'action' AS action,
       a->>'classification' AS classification,
       CASE WHEN a->>'classification' = 'baseline' THEN NULL
            ELSE m->'buckets'->(a->>'classification')->>'id' END AS bucket_id,
       CASE WHEN a->>'scheduleMode' = 'rebase'
            THEN (a->>'sourceStart')::date + ((m->>'g0')::date - (m->>'originalAnchor')::date)
            ELSE (a->'expected'->>'planned_start_date')::date END AS new_start,
       CASE WHEN a->>'scheduleMode' = 'rebase'
            THEN (a->>'sourceEnd')::date + ((m->>'g0')::date - (m->>'originalAnchor')::date)
            ELSE (a->'expected'->>'planned_end_date')::date END AS new_end
FROM co_manifest, LATERAL jsonb_array_elements(m->'sources') s,
LATERAL jsonb_array_elements(s->'assignments') a
WHERE s->>'decision' = 'include';

CREATE FUNCTION pg_temp.co_exceptions() RETURNS TABLE(source_key text, exception text)
LANGUAGE plpgsql AS $$
DECLARE cfg jsonb; r record; b record; a project_allocations; v jsonb; p projects; run assignment_import_runs;
BEGIN
 SELECT m INTO STRICT cfg FROM co_manifest;
 RETURN QUERY SELECT * FROM pg_temp.co_client_exceptions();
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='project_allocations'::regclass
   AND tgname='assignment_commercial_bucket_guard' AND tgenabled IN ('O','A')) THEN
   RETURN QUERY SELECT '*'::text, 'Assignment commercial schema guard is not deployed/enabled';
 END IF;
 IF EXISTS(SELECT 1 FROM project_planner_connections WHERE project_id=cfg->>'projectId' AND sync_enabled)
    OR EXISTS(SELECT 1 FROM background_jobs WHERE type LIKE 'planner%' AND status IN ('queued','running','retrying')
      AND (tenant_id=cfg->>'tenantId' OR payload->>'projectId'=cfg->>'projectId')) THEN
   RETURN QUERY SELECT '*'::text, 'Planner connection enabled or queued/in-flight tenant Planner jobs remain';
 END IF;
 IF coalesce(cfg->>'operatorReference','') = '' OR cfg->>'inventoryReviewed' IS DISTINCT FROM 'true'
    OR cfg->>'plannerMaintenanceConfirmed' IS DISTINCT FROM 'true' THEN
   RETURN QUERY SELECT '*'::text, 'Operator reference, reviewed production inventory and Planner maintenance acknowledgement required';
 END IF;
 SELECT * INTO p FROM projects WHERE id=cfg->>'projectId' AND tenant_id=cfg->>'tenantId'
   AND name=cfg->>'projectName';
 IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM tenants WHERE id=cfg->>'tenantId' AND name=cfg->>'tenantName')
    OR NOT EXISTS(SELECT 1 FROM clients WHERE id=p.client_id AND tenant_id=p.tenant_id AND name=cfg->>'clientName')
    OR p.status='archived' THEN
   RETURN QUERY SELECT '*', 'Exact tenant/project/client identity is missing, conflicting or archived';
 END IF;
 IF cfg->>'g0' IS NULL OR cfg->>'originalAnchor' IS NULL THEN
   RETURN QUERY SELECT '*', 'G0 and reviewed original anchor are required (default G0 2026-08-18)';
 END IF;
 IF cfg->'contractChecks' IS DISTINCT FROM
 '{"recovery":24092,"recoveryNetHours":74.5,"baselineExcludedHours":5,"configuration":50000,"advisoryCap":26000,"coTotal":100092,"originalSow":134425,"combinedCeiling":234517,"julyContributedValue":14000,"julyBilled":0}'::jsonb THEN
   RETURN QUERY SELECT '*', 'Contractual checks differ from signed source';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(cfg->'sources') s GROUP BY s->>'key' HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM co_rows c GROUP BY c.source_key HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM co_rows c GROUP BY c.allocation_id HAVING count(*)>1) THEN
   RETURN QUERY SELECT '*', 'Duplicate source keys or ambiguous assignment mappings';
 END IF;
 FOR r IN SELECT s FROM jsonb_array_elements(cfg->'sources') s LOOP
   IF r.s->>'decision' NOT IN ('include','exclude') OR r.s->>'decision' IS NULL
      OR (r.s->>'decision'='exclude' AND coalesce(r.s->>'reviewNote','')='')
      OR (r.s->>'decision'='include' AND
        (jsonb_typeof(r.s->'assignments') IS DISTINCT FROM 'array'
         OR coalesce(jsonb_array_length(r.s->'assignments'),0)=0)) THEN
     RETURN QUERY SELECT r.s->>'key', 'Unresolved source decision or missing reviewed mapping/exclusion reason';
   END IF;
   IF r.s->>'key' IN ('G5','G6','July-contributed') AND r.s->>'decision'<>'exclude' THEN
     RETURN QUERY SELECT r.s->>'key', 'Later scope / contributed support is excluded from this package';
   END IF;
 END LOOP;
 IF (SELECT count(DISTINCT value->>'id') FROM jsonb_each(cfg->'buckets')) <> 3
    OR (SELECT count(*) FROM jsonb_each(cfg->'buckets')) <> 3 THEN
   RETURN QUERY SELECT '*', 'Exactly three distinct approved existing bucket IDs required; baseline is not a bucket';
 END IF;
 FOR b IN SELECT key, value FROM jsonb_each(cfg->'buckets') LOOP
   IF NOT EXISTS (SELECT 1 FROM commercial_buckets cb WHERE cb.id=b.value->>'id'
     AND cb.project_id=p.id AND cb.tenant_id=p.tenant_id AND cb.is_active AND cb.archived_at IS NULL
     AND to_jsonb(cb)=b.value->'expected'
     AND cb.basis=CASE WHEN b.key='advisory' THEN 'capped_tm' ELSE 'fixed_fee' END
     AND CASE WHEN b.key='advisory' THEN cb.dollar_ceiling=26000
              WHEN b.key='configuration' THEN cb.value_basis=50000
              WHEN b.key='recovery' THEN cb.value_basis=24092 ELSE false END) THEN
     RETURN QUERY SELECT '*', 'Missing, changed, archived, wrong-project or conflicting bucket: '||b.key;
   END IF;
 END LOOP;
 SELECT * INTO run FROM assignment_import_runs WHERE project_id=p.id AND package_key=cfg->>'packageKey';
 IF run.id IS NOT NULL AND (run.manifest IS DISTINCT FROM cfg OR run.rolled_back_at IS NOT NULL) THEN
   RETURN QUERY SELECT '*', 'Package key already used with a different manifest or rolled back; do not replay';
 END IF;
 FOR r IN SELECT * FROM co_rows LOOP
   IF r.source_key IS NULL OR r.allocation_id IS NULL OR r.action IS NULL OR r.action NOT IN ('insert','update','noop')
      OR r.classification NOT IN ('baseline','recovery','configuration','advisory') OR r.classification IS NULL
      OR r.mapping->>'scheduleMode' NOT IN ('preserve','rebase') OR r.mapping->>'scheduleMode' IS NULL
      OR r.mapping->>'ownerReviewed' IS DISTINCT FROM 'true'
      OR r.mapping->>'effortRatesReviewed' IS DISTINCT FROM 'true'
      OR r.mapping->>'hierarchyReviewed' IS DISTINCT FROM 'true'
      OR r.mapping->>'scheduleReviewed' IS DISTINCT FROM 'true'
      OR coalesce(r.mapping->>'reviewNote','')='' THEN
     RETURN QUERY SELECT r.source_key, 'Missing explicit action, classification, schedule mode or review approvals';
   END IF;
   SELECT * INTO a FROM project_allocations WHERE id=r.allocation_id;
   -- An exact rerun is a no-op, but never conceals subsequent edits or deletions.
   IF run.id IS NOT NULL THEN
     IF NOT EXISTS(SELECT 1 FROM assignment_import_rows ir WHERE ir.run_id=run.id AND ir.source_key=r.source_key
       AND ir.after_image=to_jsonb(a)) THEN
       RETURN QUERY SELECT r.source_key, 'Imported assignment changed since apply; preserved, not overwritten';
     END IF;
     CONTINUE;
   END IF;
   IF r.action IN ('update','noop') THEN
     IF a.id IS NULL OR a.project_id IS DISTINCT FROM p.id OR a.tenant_id IS DISTINCT FROM p.tenant_id
        OR a.is_baseline OR to_jsonb(a) IS DISTINCT FROM r.mapping->'expected' THEN
       RETURN QUERY SELECT r.source_key, 'Existing assignment missing, snapshot, outside scope or differs from full expected before-image';
     END IF;
     v := to_jsonb(a);
   ELSE
     IF a.id IS NOT NULL THEN RETURN QUERY SELECT r.source_key, 'Insert ID already exists; never match by title'; END IF;
     v := r.mapping->'values';
     IF v IS NULL OR (v - ARRAY['person_id','role_id','resource_name','project_epic_id','project_stage_id','project_workstream_id',
         'task_description','hours','pricing_mode','rack_rate','billing_rate','cost_rate','week_number','planned_start_date','planned_end_date','notes']) <> '{}'::jsonb
        OR coalesce(v->>'task_description','')='' OR (v->>'hours')::numeric IS NULL OR (v->>'hours')::numeric<=0
        OR (v->>'rack_rate')::numeric IS NULL OR (v->>'rack_rate')::numeric<0
        OR v->>'pricing_mode' NOT IN ('person','role','resource_name') OR v->>'pricing_mode' IS NULL
        OR (v->>'week_number')::integer IS NULL THEN
       RETURN QUERY SELECT r.source_key, 'Insert requires reviewed allowed fields, description, positive effort, explicit rates, pricing mode and week number';
     END IF;
     IF r.mapping->>'scheduleMode'='preserve' THEN
       RETURN QUERY SELECT r.source_key, 'Historical/preserved work must map existing records, not manufacture assignments';
     END IF;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM users u WHERE u.id=v->>'person_id' AND u.is_active AND u.is_assignable
      AND (u.primary_tenant_id=p.tenant_id OR EXISTS(SELECT 1 FROM tenant_users tu WHERE tu.user_id=u.id AND tu.tenant_id=p.tenant_id AND tu.status='active'))) THEN
     RETURN QUERY SELECT r.source_key, 'Reviewed active assignable owner in this tenant required';
   END IF;
   IF r.action='insert' AND NOT EXISTS(SELECT 1 FROM project_engagements e WHERE e.project_id=p.id
      AND e.user_id=v->>'person_id' AND e.tenant_id=p.tenant_id AND e.status='active') THEN
     RETURN QUERY SELECT r.source_key, 'Create/approve owner engagement in application before import; existing engagements are never rewritten';
   END IF;
   IF v->>'role_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM roles WHERE id=v->>'role_id' AND tenant_id=p.tenant_id) THEN
     RETURN QUERY SELECT r.source_key, 'Role is outside tenant';
   END IF;
   IF v->>'project_epic_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_epics WHERE id=v->>'project_epic_id' AND project_id=p.id) THEN
     RETURN QUERY SELECT r.source_key, 'Epic is outside project';
   END IF;
   IF v->>'project_stage_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_stages st JOIN project_epics e ON e.id=st.epic_id
      WHERE st.id=v->>'project_stage_id' AND e.project_id=p.id AND e.id=v->>'project_epic_id') THEN
     RETURN QUERY SELECT r.source_key, 'Stage is outside project or conflicts with epic';
   END IF;
   IF v->>'project_workstream_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM project_workstreams WHERE id=v->>'project_workstream_id' AND project_id=p.id) THEN
     RETURN QUERY SELECT r.source_key, 'Workstream is outside project';
   END IF;
   IF r.mapping->>'scheduleMode'='rebase' THEN
     IF r.classification IN ('baseline','recovery') OR r.parent_key IN ('recovery-May-June','baseline-excluded','July-contributed')
       OR (r.action<>'insert' AND (a.status NOT IN ('open','in_progress') OR a.completed_date IS NOT NULL))
       OR r.mapping->>'sourcePrecision' IS NULL OR r.mapping->>'sourceStart' IS NULL OR r.mapping->>'sourceEnd' IS NULL
       OR (r.mapping->>'sourceStart')::date < (cfg->>'originalAnchor')::date
       OR r.new_start IS NULL OR r.new_end IS NULL OR r.new_end<r.new_start THEN
       RETURN QUERY SELECT r.source_key, 'Rebase requires reviewed exact source dates/offsets for forward uncompleted CO work only';
     END IF;
   END IF;
   IF r.action='noop' AND (a.commercial_bucket_id IS DISTINCT FROM r.bucket_id
        OR a.planned_start_date IS DISTINCT FROM r.new_start OR a.planned_end_date IS DISTINCT FROM r.new_end) THEN
     RETURN QUERY SELECT r.source_key, 'No-op does not match proposed mapping/dates';
   END IF;
   IF r.bucket_id IS NOT NULL AND EXISTS(SELECT 1 FROM commercial_buckets cb WHERE cb.id=r.bucket_id
       AND cb.approval_required) AND coalesce(r.mapping->>'approvalReference','')='' THEN
     RETURN QUERY SELECT r.source_key, 'Bucket requires reviewed approval reference';
   END IF;
   IF r.bucket_id IS NOT NULL AND EXISTS(SELECT 1 FROM commercial_buckets cb WHERE cb.id=r.bucket_id AND
       (r.new_start<cb.effective_start_date OR r.new_end>cb.effective_end_date))
       AND r.mapping->>'bucketWindowReviewed' IS DISTINCT FROM 'true' THEN
     RETURN QUERY SELECT r.source_key, 'Schedule outside bucket window: review explicitly; never expand terms automatically';
   END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM co_rows) THEN RETURN QUERY SELECT '*', 'No reviewed assignment rows'; END IF;
END $$;

CREATE TEMP VIEW co_preview AS
SELECT c.source_key, c.source_ref, c.source_title,
 CASE WHEN ir.source_key IS NOT NULL THEN 'noop (already imported)' ELSE c.action END AS proposed_action,
 c.allocation_id AS exact_assignment_id,
 coalesce(a.person_id,c.mapping->'values'->>'person_id') AS owner_id,
 u.name AS owner_name, coalesce(a.resource_name,c.mapping->'values'->>'resource_name') AS resource_name,
 coalesce(a.project_epic_id,c.mapping->'values'->>'project_epic_id') AS epic_id,
 coalesce(a.project_stage_id,c.mapping->'values'->>'project_stage_id') AS stage_id,
 coalesce(a.project_workstream_id,c.mapping->'values'->>'project_workstream_id') AS workstream_id,
 c.classification, c.bucket_id, b.label AS bucket_label,
 a.planned_start_date AS old_start, a.planned_end_date AS old_end, c.new_start, c.new_end,
 c.mapping->>'sourcePrecision' AS source_precision, c.mapping->>'reviewNote' AS review_note,
 CASE WHEN c.new_start<b.effective_start_date OR c.new_end>b.effective_end_date THEN 'Review: outside commercial window' END AS schedule_warning
FROM co_rows c CROSS JOIN co_manifest m
LEFT JOIN project_allocations a ON a.id=c.allocation_id AND a.project_id=m.m->>'projectId' AND a.tenant_id=m.m->>'tenantId'
LEFT JOIN users u ON u.id=coalesce(a.person_id,c.mapping->'values'->>'person_id')
LEFT JOIN commercial_buckets b ON b.id=c.bucket_id AND b.project_id=m.m->>'projectId' AND b.tenant_id=m.m->>'tenantId'
LEFT JOIN assignment_import_runs run ON run.project_id=m.m->>'projectId' AND run.package_key=m.m->>'packageKey'
LEFT JOIN assignment_import_rows ir ON ir.run_id=run.id AND ir.source_key=c.source_key;
