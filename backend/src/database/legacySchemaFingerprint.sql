SELECT c.table_name,
       jsonb_agg(jsonb_build_object(
         'name', c.column_name,
         'type', c.udt_name,
         'nullable', c.is_nullable,
         'default', c.column_default,
         'length', c.character_maximum_length,
         'precision', c.numeric_precision,
         'scale', c.numeric_scale
       ) ORDER BY c.ordinal_position) AS columns,
       COALESCE((SELECT jsonb_agg(pg_get_constraintdef(con.oid) ORDER BY pg_get_constraintdef(con.oid))
                 FROM pg_constraint con
                 JOIN pg_class cls ON cls.oid=con.conrelid
                 JOIN pg_namespace ns ON ns.oid=cls.relnamespace
                 WHERE ns.nspname='public' AND cls.relname=c.table_name
                   AND con.contype IN ('p','f','u','c','x')), '[]'::jsonb) AS constraints
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name <> 'schema_migrations'
GROUP BY c.table_name
ORDER BY c.table_name;
