DO $apply$
DECLARE cfg jsonb; r jsonb; images jsonb:='[]'; actual jsonb;
BEGIN
 SELECT m INTO STRICT cfg FROM guardrails_payload;
 PERFORM pg_temp.guardrails_check();
 IF EXISTS(SELECT 1 FROM public.ai_guardrails_import_runs WHERE package_key=cfg->>'packageKey') THEN
  PERFORM pg_temp.guardrails_dependencies();
  RAISE NOTICE 'Identical unchanged import; no writes'; RETURN;
 END IF;
 -- INSERT_RECORDS
 FOR r IN SELECT value FROM jsonb_array_elements(cfg->'records') LOOP
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',r->>'table')
    INTO STRICT actual USING r->'values'->>'id';
  images:=images||jsonb_build_array(jsonb_build_object('table',r->>'table','row',actual));
 END LOOP;
 INSERT INTO public.ai_guardrails_import_runs(package_key,preview_hash,tenant_id,manifest,after_images,operator_reference)
 VALUES(cfg->>'packageKey',cfg->>'previewHash',cfg->'review'->'tenant'->>'id',cfg,images,cfg->'review'->>'operatorReference');
END $apply$;
