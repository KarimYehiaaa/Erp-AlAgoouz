-- Anchor only ERP-owned function signatures; do not change extensions or defaults.
-- pg_temp must be last so a caller's temporary tables cannot shadow ERP tables.
DO $$
DECLARE
  function_signature TEXT;
  api_role TEXT;
  erp_functions TEXT[] := ARRAY[
    'public.update_updated_at()',
    'public.enforce_production_output_warehouse()',
    'public.enforce_stocked_recipe_primary_warehouse()',
    'public.prevent_clearing_stocked_product_primary_warehouse()',
    'public.protect_db_row_audits()',
    'public.audit_row_changes()',
    'public.protect_default_roles_func()',
    'public.prevent_closed_period_modification()',
    'public.cleanup_expired_idempotency_records()',
    'public.purge_db_row_audits(integer)',
    'public.check_journal_entry_balance()'
  ];
BEGIN
  FOREACH function_signature IN ARRAY erp_functions LOOP
    IF pg_catalog.to_regprocedure(function_signature) IS NULL THEN
      RAISE EXCEPTION 'Required ERP function missing: %', function_signature;
    END IF;
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp',
      function_signature
    );
    -- Owners and explicit backend grants retain EXECUTE. These functions are
    -- internal triggers/maintenance, not public Supabase RPC endpoints.
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_signature);
    FOR api_role IN
      SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE EXECUTE ON FUNCTION %s FROM %I', function_signature, api_role
      );
    END LOOP;
  END LOOP;

  -- Supabase's optional existing RLS event trigger remains installed and enabled.
  -- It genuinely needs its existing definer privilege to enforce new-table RLS.
  function_signature := 'public.rls_auto_enable()';
  IF pg_catalog.to_regprocedure(function_signature) IS NOT NULL THEN
    IF (SELECT prorettype FROM pg_catalog.pg_proc
        WHERE oid = pg_catalog.to_regprocedure(function_signature))
       <> 'pg_catalog.event_trigger'::pg_catalog.regtype THEN
      RAISE EXCEPTION 'Unexpected return type for %; review before changing it', function_signature;
    END IF;
    EXECUTE 'ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog, pg_temp';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    FOR api_role IN
      SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I', api_role
      );
    END LOOP;
  END IF;
END;
$$;
