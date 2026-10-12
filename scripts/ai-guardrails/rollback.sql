DO $rollback$
DECLARE cfg jsonb; r jsonb;
BEGIN
 SELECT m INTO STRICT cfg FROM guardrails_payload;
 IF NOT EXISTS(SELECT 1 FROM public.ai_guardrails_import_runs WHERE package_key=cfg->>'packageKey')
 THEN RAISE EXCEPTION 'Import not applied'; END IF;
 PERFORM pg_temp.guardrails_check();
 PERFORM pg_temp.guardrails_dependencies();
 FOR r IN SELECT value FROM jsonb_array_elements(cfg->'records') WITH ORDINALITY x(value,n) ORDER BY n DESC LOOP
  EXECUTE format('DELETE FROM public.%I WHERE id=$1',r->>'table') USING r->'values'->>'id';
 END LOOP;
 UPDATE public.ai_guardrails_import_runs SET rolled_back_at=now() WHERE package_key=cfg->>'packageKey';
END $rollback$;
