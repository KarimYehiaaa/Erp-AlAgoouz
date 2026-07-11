import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const DB_HOST = process.env.DB_HOST;
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_NAME = process.env.DB_NAME || 'postgres';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_SSL = process.env.DB_SSL === 'true';

async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`  → تنفيذ: ${path.basename(filePath)}`);
  await client.query(sql);
}

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../migrations');
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(migrationsDir, file));
}

async function main() {
  console.log('\n☕ بن العجوز — ترحيل قاعدة البيانات إلى Supabase\n');

  if (!DB_PASSWORD || !DB_HOST) {
    console.error('❌ خطأ: لم يتم العثور على إعدادات قاعدة البيانات في ملف backend/.env');
    console.error('يرجى التحقق من توفر DB_HOST و DB_PASSWORD و DB_USER.');
    process.exit(1);
  }

  console.log(`محاولة الاتصال بقاعدة البيانات على: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    ...(DB_SSL && { ssl: { rejectUnauthorized: false } }),
  });

  try {
    await client.connect();
    console.log('✅ تم الاتصال بنجاح بقاعدة بيانات Supabase!');
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    process.exit(1);
  }

  try {
    const files = getMigrationFiles();
    console.log(`جاري تشغيل ${files.length} ملف ترحيل (Migration)...`);

    for (const file of files) {
      if (!fs.existsSync(file)) throw new Error(`ملف غير موجود: ${file}`);
      await runSqlFile(client, file);
    }

    console.log('\n🎉 تم ترحيل وتجهيز قاعدة البيانات بنجاح على Supabase!');
  } catch (err) {
    console.error('\n❌ فشل ترحيل قاعدة البيانات:', err.message);
  } finally {
    await client.end();
  }
}

main();
