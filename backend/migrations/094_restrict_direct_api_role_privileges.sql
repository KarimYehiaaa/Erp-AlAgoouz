-- ERP clients go through the backend API, not Supabase's public Data API.
-- Keep anon/authenticated away from business tables, views, and sequences;
-- backend database users and service_role permissions are unchanged.
DO $$
DECLARE
  api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', api_role
      );
      EXECUTE pg_catalog.format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', api_role
      );
      -- Migrations create ERP objects as the configured database owner. Remove
      -- Supabase's standard API-role grants from objects created in the future.
      EXECUTE pg_catalog.format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role
      );
      EXECUTE pg_catalog.format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role
      );
    END IF;
  END LOOP;
END;
$$;
