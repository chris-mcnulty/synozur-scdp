SELECT * FROM pg_temp.co_exceptions() ORDER BY source_key, exception;
SELECT ir.source_key, ir.action, ir.allocation_id,
       CASE WHEN to_jsonb(a)=ir.after_image THEN 'unchanged / verified' ELSE 'EXCEPTION: changed or missing' END AS verification
FROM assignment_import_runs r JOIN assignment_import_rows ir ON ir.run_id=r.id
CROSS JOIN co_manifest m
LEFT JOIN project_allocations a ON a.id=ir.allocation_id AND a.project_id=r.project_id AND a.tenant_id=r.tenant_id
WHERE r.project_id=m.m->>'projectId' AND r.tenant_id=m.m->>'tenantId' AND r.package_key=m.m->>'packageKey';
SELECT (SELECT count(*) FROM co_rows) AS manifest_count, count(ir.*) AS ledger_count,
 count(*) FILTER (WHERE ir.after_image=to_jsonb(a)) AS verified_count
FROM assignment_import_runs r JOIN assignment_import_rows ir ON ir.run_id=r.id CROSS JOIN co_manifest m
LEFT JOIN project_allocations a ON a.id=ir.allocation_id
WHERE r.project_id=m.m->>'projectId' AND r.tenant_id=m.m->>'tenantId' AND r.package_key=m.m->>'packageKey';
SELECT classification, owner_id, new_start, new_end, count(*) FROM co_preview
GROUP BY classification, owner_id, new_start, new_end ORDER BY classification, owner_id;
