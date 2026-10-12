SELECT x->>'sourceKey' AS source_key, x->>'id' AS id, x->>'type' AS type,
 x->>'title' AS title, x->>'dueDate' AS due_date,
 NULL::text AS owner_id, NULL::text AS assignee_id,
 CASE WHEN r.id IS NULL THEN 'insert (not applied)'
      WHEN r.rolled_back_at IS NOT NULL THEN 'EXCEPTION: rolled back'
      WHEN r.manifest->'plan' IS DISTINCT FROM m THEN 'EXCEPTION: manifest changed'
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.manifest->'afterImages') image
        WHERE image=to_jsonb(e) AND image->>'id'=x->>'id') THEN 'unchanged / verified'
      ELSE 'EXCEPTION: changed or missing' END AS verification
FROM co_manifest CROSS JOIN LATERAL jsonb_array_elements(coalesce(m->'clientTracking','[]'::jsonb)) x
LEFT JOIN assignment_import_runs r ON r.project_id=m->>'projectId' AND r.tenant_id=m->>'tenantId'
 AND r.package_key=(m->>'packageKey')||'-client-tracking'
LEFT JOIN raidd_entries e ON e.id=x->>'id' AND e.project_id=m->>'projectId' AND e.tenant_id=m->>'tenantId'
ORDER BY x->>'sourceKey';
