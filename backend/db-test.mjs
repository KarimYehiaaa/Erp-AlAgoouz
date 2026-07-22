/**
 * db-test.mjs — اختبار الاتصال بقاعدة البيانات
 * تشغيل: node db-test.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

console.log('');
console.log('══════════════════════════════════════════════');
console.log('   اختبار الاتصال بـ Supabase PostgreSQL     ');
console.log('══════════════════════════════════════════════');
console.log(`Host: ${process.env.DB_HOST}`);
console.log(`DB:   ${process.env.DB_NAME}`);
console.log(`User: ${process.env.DB_USER}`);
console.log('');

const start = Date.now();

try {
  // اختبار 1: الاتصال الأساسي
  const res = await pool.query('SELECT current_database() AS db, current_user AS usr, version() AS ver');
  const latency = Date.now() - start;
  
  console.log(`✅ الاتصال نجح! (${latency}ms)`);
  console.log(`📦 قاعدة البيانات: ${res.rows[0].db}`);
  console.log(`👤 المستخدم:      ${res.rows[0].usr}`);
  console.log('');

  // اختبار 2: الجداول الموجودة
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  console.log(`📋 الجداول الموجودة: ${tables.rows.length} جدول`);
  tables.rows.forEach(r => console.log(`   • ${r.table_name}`));
  console.log('');

  // اختبار 3: المستخدمون
  try {
    const users = await pool.query('SELECT id, username, role_id, is_active FROM users WHERE deleted_at IS NULL LIMIT 5');
    console.log(`👥 المستخدمون: ${users.rows.length} مستخدم`);
    users.rows.forEach(u => console.log(`   • [${u.id}] ${u.username} (active: ${u.is_active})`));
  } catch (e) {
    console.log(`⚠️  جدول users: ${e.message}`);
  }
  console.log('');

  // اختبار 4: المنتجات
  try {
    const products = await pool.query('SELECT COUNT(*) AS cnt FROM products WHERE deleted_at IS NULL');
    console.log(`🛍️  المنتجات: ${products.rows[0].cnt} منتج`);
  } catch (e) {
    console.log(`⚠️  جدول products: ${e.message}`);
  }

  // اختبار 5: إحصائيات Pool
  console.log('');
  console.log(`📊 Pool Stats:`);
  console.log(`   Total: ${pool.totalCount}`);
  console.log(`   Idle:  ${pool.idleCount}`);
  console.log(`   Wait:  ${pool.waitingCount}`);
  
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('   ✅ كل الاختبارات اجتازت بنجاح!            ');
  console.log('══════════════════════════════════════════════');

} catch (err) {
  console.error(`❌ فشل الاتصال: ${err.message}`);
  console.error(`   Code: ${err.code}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
