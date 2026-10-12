-- One read-only statement, compatible with SQL consoles that batch transactions.
-- Run against the confirmed published-app database. Returns one JSON result.
SELECT jsonb_build_object(
  'database_name', current_database(),
  'tenants', COALESCE((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)
    FROM (SELECT id,name,slug FROM public.tenants
      WHERE lower(trim(name))=lower('The Synozur Alliance') OR slug='synozur') t
  ), '[]'::jsonb),
  'matching_clients', COALESCE((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
    FROM (SELECT c.id,c.tenant_id,c.name,c.status,c.currency FROM public.clients c
      JOIN public.tenants t ON t.id=c.tenant_id WHERE t.slug='synozur'
      AND (c.name ILIKE '%FRC%' OR c.name ILIKE '%Stealth%')) c
  ), '[]'::jsonb),
  'roles', COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.id)
    FROM (SELECT id,name,tenant_id,default_cost_rate::text,default_rack_rate::text,is_always_salaried
      FROM public.roles WHERE tenant_id IS NULL OR tenant_id IN
      (SELECT id FROM public.tenants WHERE slug='synozur')) r
  ), '[]'::jsonb),
  'currency_settings', COALESCE((
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.setting_key)
    FROM (SELECT setting_key,setting_value FROM public.tenant_settings
      WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug='synozur')
      AND setting_key ILIKE '%currency%') s
  ), '[]'::jsonb),
  'schema_columns', COALESCE((
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.table_name,c.ordinal_position)
    FROM (SELECT table_name,column_name,data_type,is_nullable,column_default,ordinal_position
      FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('clients','estimates','estimate_epics','estimate_stages',
        'estimate_activities','estimate_line_items','roles')) c
  ), '[]'::jsonb)
) AS guardrails_inventory;
