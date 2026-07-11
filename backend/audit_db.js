import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

// Load .env from the backend directory
dotenv.config();

const BACKUP_FILE = 'd:/AlAgoouz System/AlAgoouz-erp/backend/backups/auto-backup-2026-06-26_20-03-32.json';

async function main() {
  console.log('\n======================================================');
  console.log('       ☕ بن العجوز — فحص مطابقة البيانات المسترجعة');
  console.log('======================================================\n');
  
  // 1. Read backup file
  let content;
  try {
    content = await fs.readFile(BACKUP_FILE, 'utf8');
  } catch (e) {
    console.error('❌ فشل قراءة ملف النسخة الاحتياطية:', e.message);
    process.exit(1);
  }
  
  const parsed = JSON.parse(content);
  const backupData = parsed.data || {};
  
  // 2. Connect to Database
  const pool = new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'bin_al_ajouz',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD,
  });
  
  // 3. Compare tables
  const tables = Object.keys(backupData);
  
  console.log('| الجدول | العدد في النسخة | العدد في القاعدة | الحالة |');
  console.log('| :--- | :---: | :---: | :---: |');
  
  let totalBackup = 0;
  let totalDb = 0;
  let mismatches = 0;

  for (const table of tables) {
    const backupCount = Array.isArray(backupData[table]) ? backupData[table].length : 0;
    totalBackup += backupCount;
    
    let dbCount = 0;
    let status = '✅ متطابق';
    
    try {
      const res = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
      dbCount = parseInt(res.rows[0].count, 10);
      totalDb += dbCount;
      
      if (dbCount !== backupCount) {
        status = `❌ غير متطابق (${dbCount - backupCount})`;
        mismatches++;
      }
    } catch (err) {
      status = `⚠️ خطأ في الاستعلام (${err.message})`;
      mismatches++;
    }
    
    console.log(`| ${table} | ${backupCount} | ${dbCount} | ${status} |`);
  }
  
  console.log('\n======================================================');
  console.log('                     الملخص');
  console.log('======================================================');
  console.log(`* إجمالي الجداول المفحوصة: ${tables.length}`);
  console.log(`* إجمالي السجات في النسخة الاحتياطية: ${totalBackup}`);
  console.log(`* إجمالي السجلات في قاعدة البيانات: ${totalDb}`);
  console.log(`* عدد الفروقات المكتشفة: ${mismatches}`);
  console.log('======================================================\n');
  
  await pool.end();
}

main().catch(err => {
  console.error('خطأ غير متوقع:', err);
});
