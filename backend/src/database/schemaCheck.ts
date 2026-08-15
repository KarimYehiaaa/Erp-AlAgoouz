import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './pool.ts';
import logger from '../services/loggerService.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../../migrations');

/**
 * مقارنة إصدار مخطط قاعدة البيانات مع ملفات الهجرات وتطبيق ما هو ناقص.
 * @returns {Promise<void>}
 */
export const checkSchemaVersion = async () => {
  try {
    // 1. Get all migration files on disk
    if (!fs.existsSync(migrationsDir)) {
      logger.warn('⚠️ [بن العجوز ERP] مجلد الهجرات (migrations) غير موجود.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) return;

    // 2. Check if schema_migrations table exists in DB
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      )
    `);

    const hasMigrationsTable = tableCheck.rows[0].exists;

    if (!hasMigrationsTable) {
      const msg =
        '❌ [بن العجوز ERP] خطأ: لم يتم تهيئة جداول قاعدة البيانات بعد. يرجى تشغيل أمر التهيئة أولاً: npm run setup';
      logger.error(msg);
      console.error(msg);
      process.exit(1);
    }

    // 3. Get applied migrations from DB
    const appliedRes = await query(`SELECT version FROM schema_migrations`);
    const appliedVersions = new Set(appliedRes.rows.map((row) => row.version));

    // 4. Find any pending migrations
    const pending = files.filter((file) => !appliedVersions.has(file));

    if (pending.length > 0) {
      const msg =
        `❌ [بن العجوز ERP] خطأ: قاعدة البيانات متأخرة عن كود البرنامج ولديك (${pending.length}) هجرات معلقة.\n` +
        `المعلقات: ${pending.join(', ')}\n` +
        `يرجى تشغيل أمر التحديث لتحديث قاعدة البيانات بأمان: npm run update`;
      logger.error(msg);
      console.error(msg);
      process.exit(1);
    }

    logger.info('✅ [بن العجوز ERP] قاعدة البيانات متوافقة ومحدثة بالكامل مع كود البرنامج.');
  } catch (err: any) {
    logger.error('❌ [بن العجوز ERP] فشل فحص إصدار قاعدة البيانات: %s', err.message);
    // Do not crash the server on network/connection issues on startup,
    // the app will handle DB reconnection or show 503 error.
  }
};

export default checkSchemaVersion;
