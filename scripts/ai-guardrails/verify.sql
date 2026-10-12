DO $verify$
DECLARE cfg jsonb;
BEGIN
 SELECT m INTO STRICT cfg FROM guardrails_payload;
 IF NOT EXISTS(SELECT 1 FROM public.ai_guardrails_import_runs WHERE package_key=cfg->>'packageKey')
 THEN RAISE EXCEPTION 'Import not applied'; END IF;
 PERFORM pg_temp.guardrails_check();
 PERFORM pg_temp.guardrails_dependencies();
END $verify$;
SELECT e.id,e.name,e.status,e.project_id,e.total_hours,e.total_fees,
 count(l.id) AS lines,sum(l.adjusted_hours) AS line_hours,sum(l.total_amount) AS line_fees,
 sum(l.total_cost) AS internal_cost
FROM public.estimates e JOIN public.estimate_line_items l ON l.estimate_id=e.id
WHERE e.id=(SELECT x->'values'->>'id' FROM guardrails_payload,jsonb_array_elements(m->'records') x WHERE x->>'table'='estimates')
GROUP BY e.id;
