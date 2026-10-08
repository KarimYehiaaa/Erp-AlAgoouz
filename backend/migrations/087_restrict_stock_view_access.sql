-- Stock and purchase costs are served through authenticated ERP endpoints.
-- Do not expose this owner-privileged view through the public Supabase Data API.
REVOKE ALL PRIVILEGES ON public.v_product_stock FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON public.v_product_stock FROM %I', api_role);
    END IF;
  END LOOP;
  -- PostgreSQL 15+ supports enforcing the caller's underlying table policies.
  -- Older local installations remain protected by the explicit privilege revokes.
  IF current_setting('server_version_num')::integer >= 150000 THEN
    EXECUTE 'ALTER VIEW public.v_product_stock SET (security_invoker = true)';
  END IF;
END
$$;
