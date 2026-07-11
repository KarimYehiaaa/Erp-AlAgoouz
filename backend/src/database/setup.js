/**
 * إعداد قاعدة البيانات تلقائياً
 * الاستخدام: node src/database/setup.js
 * أو مع كلمة مرور postgres: set POSTGRES_PASSWORD=yourpassword && node src/database/setup.js
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPgFile = path.join(__dirname, '../../.postgres.local');
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}
const { Client } = pg;

const DB_NAME = process.env.DB_NAME || 'bin_al_ajouz';
const DB_USER = process.env.DB_USER || 'erp_user';
const DB_PASSWORD = process.env.DB_PASSWORD;
const ADMIN_USER = process.env.POSTGRES_USER || 'postgres';
const ADMIN_PASSWORD = process.env.POSTGRES_PASSWORD || '';

async function connectAsAdmin() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: ADMIN_USER,
    password: ADMIN_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  return client;
}

async function connectAsApp() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  });
  await client.connect();
  return client;
}

async function runSqlFile(client, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  console.log(`  → تنفيذ: ${path.basename(filePath)}`);
  await client.query(sql);
}

function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  return fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(migrationsDir, file));
}

async function main() {
  console.log('\n☕ بن العجوز — إعداد PostgreSQL\n');

  if (!DB_PASSWORD) {
    console.error('❌ مطلوب DB_PASSWORD في backend/.env');
    console.error('   مثال: DB_PASSWORD=replace_with_strong_password\n');
    process.exit(1);
  }

  // تحقق إن كانت القاعدة جاهزة
  try {
    const app = await connectAsApp();
    const check = await app.query(`SELECT COUNT(*) FROM users`);
    console.log(`✅ القاعدة موجودة ومعدّة (${check.rows[0].count} مستخدمين)`);
    await app.end();
    return;
  } catch (_) {
    console.log('ℹ️  القاعدة تحتاج إعداد...\n');
  }

  if (!ADMIN_PASSWORD) {
    console.error('❌ مطلوب كلمة مرور postgres.');
    console.error('   نفّذ في PowerShell:\n');
    console.error('   $env:POSTGRES_PASSWORD="كلمة_المرور_التي_اخترتها_عند_التثبيت"');
    console.error('   node src/database/setup.js\n');
    process.exit(1);
  }

  const admin = await connectAsAdmin();
  console.log('✅ اتصال بـ postgres');

  const userExists = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [DB_USER]);
  if (!userExists.rows.length) {
    await admin.query(`CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD.replace(/'/g, "''")}'`);
    console.log(`✅ إنشاء المستخدم: ${DB_USER}`);
  } else {
    await admin.query(`ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD.replace(/'/g, "''")}'`);
    console.log(`✅ تحديث كلمة مرور: ${DB_USER}`);
  }

  const dbExists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [DB_NAME]);
  if (!dbExists.rows.length) {
    await admin.query(`CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}`);
    console.log(`✅ إنشاء قاعدة البيانات: ${DB_NAME}`);
  } else {
    console.log(`ℹ️  قاعدة البيانات موجودة: ${DB_NAME}`);
  }

  await admin.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER}`);
  await admin.end();

  const app = await connectAsApp();
  const files = getMigrationFiles();

  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`ملف غير موجود: ${file}`);
    await runSqlFile(app, file);
  }

  await app.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO ' + DB_USER);
  await app.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO ' + DB_USER);
  await app.end();

  console.log('\n🎉 تم الإعداد بنجاح!');
  console.log('   شغّل Backend: npm run dev');
  console.log('   غيّر كلمة مرور المدير قبل أي استخدام حقيقي.\n');
}

main().catch((err) => {
  console.error('\n❌ فشل الإعداد:', err.message);
  if (err.message.includes('password authentication failed')) {
    console.error('   تحقق من POSTGRES_PASSWORD (كلمة مرور المستخدم postgres)');
  }
  process.exit(1);
});
