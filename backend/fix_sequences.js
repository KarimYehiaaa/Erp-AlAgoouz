import pool from './src/database/pool.ts';

const sql = `
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT 
            tc.table_name, 
            c.column_name, 
            pg_get_serial_sequence(tc.table_schema || '.' || tc.table_name, c.column_name) as seq_name
        FROM 
            information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            JOIN information_schema.columns c ON c.table_name = tc.table_name AND c.column_name = ccu.column_name
        WHERE 
            tc.constraint_type = 'PRIMARY KEY' 
            AND tc.table_schema = 'public'
            AND pg_get_serial_sequence(tc.table_schema || '.' || tc.table_name, c.column_name) IS NOT NULL
    LOOP
        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 1))', r.seq_name, r.column_name, r.table_name);
    END LOOP;
END $$;
`;

async function main() {
  console.log('⏳ جاري إعادة ضبط عدادات الجداول (Sequences) لجميع الجداول...');
  try {
    await pool.query(sql);
    console.log('✅ تم إعادة ضبط جميع العدادات بنجاح! لن تواجه مشكلة Duplicate Key مرة أخرى.');
  } catch (err) {
    console.error('❌ فشل إعادة ضبط العدادات:', err.message);
  } finally {
    await pool.end();
  }
}

main();
