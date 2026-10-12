-- Entire batch must run on one connection with stop-on-error.
-- Serialize with ALL writers, including ordinary UI edits and FK attachments.
LOCK TABLE public.tenants,public.roles,public.clients,public.estimates,
 public.estimate_epics,public.estimate_stages,public.estimate_activities,public.estimate_line_items
 IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.ai_guardrails_import_runs(
 package_key text PRIMARY KEY, preview_hash text NOT NULL, tenant_id text NOT NULL,
 manifest jsonb NOT NULL, after_images jsonb NOT NULL,
 operator_reference text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(),
 rolled_back_at timestamptz
);
LOCK TABLE public.ai_guardrails_import_runs IN EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION pg_temp.guardrails_check() RETURNS void LANGUAGE plpgsql AS $check$
DECLARE cfg jsonb; rev jsonb; r jsonb; actual jsonb; run record;
BEGIN
 SELECT m INTO STRICT cfg FROM guardrails_payload;
 rev:=cfg->'review';
 IF current_database() IS DISTINCT FROM rev->>'databaseName' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=rev->'tenant'->>'id'
    AND name=rev->'tenant'->>'name' AND slug=rev->'tenant'->>'slug') THEN RAISE EXCEPTION 'Tenant identity changed'; END IF;
 IF (SELECT count(*) FROM public.tenants WHERE lower(trim(name))=lower(trim(rev->'tenant'->>'name')))<>1
 THEN RAISE EXCEPTION 'Ambiguous tenant'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rev->'roles') LOOP
   SELECT jsonb_build_object('id',id,'name',name,'tenant_id',tenant_id,
    'default_cost_rate',default_cost_rate::text,'default_rack_rate',default_rack_rate::text,
    'is_always_salaried',is_always_salaried) INTO actual FROM public.roles WHERE id=r->>'id';
   IF actual IS DISTINCT FROM r OR NOT (actual->>'tenant_id'=rev->'tenant'->>'id' OR actual->>'tenant_id' IS NULL)
   THEN RAISE EXCEPTION 'Role snapshot/ownership changed'; END IF;
 END LOOP;
 SELECT * INTO run FROM public.ai_guardrails_import_runs WHERE package_key=cfg->>'packageKey';
 IF FOUND THEN
   IF run.preview_hash<>cfg->>'previewHash' OR run.manifest<>cfg OR run.rolled_back_at IS NOT NULL
   THEN RAISE EXCEPTION 'Changed manifest or rolled-back import'; END IF;
   FOR r IN SELECT value FROM jsonb_array_elements(run.after_images) LOOP
     EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',r->>'table')
       INTO actual USING r->'row'->>'id';
     IF actual IS DISTINCT FROM r->'row' THEN RAISE EXCEPTION 'Imported row drift: %',r->>'table'; END IF;
   END LOOP;
 ELSE
   IF EXISTS(SELECT 1 FROM public.clients WHERE tenant_id=rev->'tenant'->>'id'
       AND lower(trim(name))=lower('FRC Stealth Company')) THEN RAISE EXCEPTION 'Unexpected existing client'; END IF;
 END IF;
END $check$;

-- Guard *all* incoming FK references, even CASCADE/SET NULL, not just projects.
-- Also rejects extra hierarchy rows/lines on an identical rerun.
CREATE OR REPLACE FUNCTION pg_temp.guardrails_dependencies() RETURNS void LANGUAGE plpgsql AS $deps$
DECLARE cfg jsonb; r jsonb; fk record; used boolean;
BEGIN
 SELECT m INTO STRICT cfg FROM guardrails_payload;
 FOR r IN SELECT value FROM jsonb_array_elements(cfg->'records') LOOP
  FOR fk IN
   SELECT c.conrelid::regclass AS child, a.attname AS col, cardinality(c.conkey) AS arity
   FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND c.confrelid=('public.'||(r->>'table'))::regclass
  LOOP
   IF fk.arity<>1 THEN RAISE EXCEPTION 'Unsupported composite FK'; END IF;
   EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE',fk.child);
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s t WHERE %I::text=$1 AND NOT EXISTS
    (SELECT 1 FROM jsonb_array_elements($2) x WHERE (''public.''||(x->>''table''))::regclass=$3
     AND x->''values''->>''id''=to_jsonb(t)->>''id''))',fk.child,fk.col)
     INTO used USING r->'values'->>'id',cfg->'records',fk.child;
   IF used THEN RAISE EXCEPTION 'Imported record is now used by %',fk.child; END IF;
  END LOOP;
 END LOOP;
END $deps$;
