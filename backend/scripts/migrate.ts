/**
 * migrate.ts — تشغيل هجرات قاعدة البيانات
 * ════════════════════════════════════════════
 * يفحص مجلد `migrations/*.sql` ويطبّق الملفات غير المنفذة بعد، مع تتبع
 * التنفيذ في جدول `schema_migrations`. لا يستنتج نطاقًا من الترحيلات من وجود
 * جدول واحد؛ يمكن اعتماد القاعدة الأساسية المطابقة فقط، وما عداها يحتاج سجلًا موثوقًا.
 *
 * يُستخدم من:
 *  - `src/index.ts` عند بدء التشغيل المحلي (استيراد ديناميكي)
 *  - `run-vitest-local.ts` (تهيئة قاعدة الاختبارات)
 *  - سطر الأوامر مباشرة لقاعدة محلية: `node scripts/migrate.ts`
 *  - القاعدة البعيدة المنسقة: `npm run migrate-supabase -- --allow-remote`
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import logger from '../src/services/loggerService.ts';

import { getClient } from '../src/database/pool.ts';
import { databaseConnectionOptions } from '../src/database/connectionOptions.ts';
import { assertMigrationsAllowed } from '../src/database/migrationApproval.ts';
import { resolveLegacyMigrationBaseline } from '../src/database/legacyMigrationBaseline.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPgFile = path.join(__dirname, '../../.postgres.local');
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}

/**
 * تطبيق جميع الهجرات المعلقة على قاعدة البيانات المتصلة.
 *
 * يُستدعى عند إقلاع الخادم (index.ts) وعند تهيئة قاعدة الاختبارات.
 *
 * @returns {Promise<void>} يكتمل بعد تطبيق كل الهجرات أو التحقق من تحديث القاعدة
 */
export async function runMigrations(options: { allowRemote?: boolean } = {}): Promise<void> {
  const client = await getClient();

  try {
    logger.info('🔄 [بن العجوز ERP] جاري فحص وتحديث جداول قاعدة البيانات (Migrations)...');

    const trackingTableRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'schema_migrations'
      )
    `);
    const trackingTableExists = trackingTableRes.rows[0].exists;

    // فحص وجود جدول users (يعني أن القاعدة مهيأة مسبقًا)
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      )
    `);

    const dbIsSetup = usersTableExists.rows[0].exists;

    // قراءة ملفات الهجرات من مجلد migrations
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      // ترتيب رقمي صارم: يمنع انقلاب ترتيب اللواحق الحرفية (041b قبل 041) تحت ICU
      .sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        return na !== nb ? na - nb : a.localeCompare(b);
      });

    // الحصول على الهجرات المنفذة مسبقًا
    const appliedRes = trackingTableExists
      ? await client.query(`SELECT version FROM schema_migrations`)
      : { rows: [] as Array<{ version: string }> };
    const applied = new Set(appliedRes.rows.map((row) => row.version));
    let legacyFilesToMark: string[] = [];

    // إذا كانت القاعدة مهيأة لكن جدول التتبع فارغ — كشف الهجرات المطبقة فعليًا
    if (dbIsSetup && applied.size === 0) {
      logger.info(
        '[بن العجوز ERP] قاعدة البيانات مهيأة مسبقاً. جاري فحص الهجرات المطبقة بالفعل...',
      );

      legacyFilesToMark = await resolveLegacyMigrationBaseline((sql) => client.query(sql));
      legacyFilesToMark.forEach((file) => applied.add(file));
    }

    const pendingFiles = files.filter((file) => !applied.has(file));
    assertMigrationsAllowed(
      databaseConnectionOptions(),
      pendingFiles,
      options.allowRemote === true,
      process.env.ERP_LOCAL_DATABASE_HOST,
      !trackingTableExists || legacyFilesToMark.length > 0,
    );

    // After the remote-change guard, ensure migration tracking exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    for (const file of legacyFilesToMark) {
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`,
        [file],
      );
      logger.info(`  → تم تسجيل الهجرة كمنفذة مسبقاً: ${file}`);
    }

    let appliedCount = 0;

    // تطبيق الهجرات المعلقة
    for (const file of pendingFiles) {
      logger.info(`[بن العجوز ERP] جاري تطبيق الهجرة: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`فشلت الهجرة ${file}: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }

    if (appliedCount > 0) {
      logger.info(`✅ [بن العجوز ERP] تم تطبيق (${appliedCount}) هجرات جديدة بنجاح.`);
    } else {
      logger.info('✅ [بن العجوز ERP] قاعدة البيانات محدثة بالكامل ولا توجد هجرات معلقة.');
    }
  } catch (err) {
    logger.error('❌ [بن العجوز ERP] فشل تحديث قاعدة البيانات: %s', (err as Error).message);
    throw err;
  } finally {
    client.release();
  }
}

// التشغيل المباشر من سطر الأوامر
const isCLI =
  process.argv[1] && process.argv[1] !== ''
    ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
    : false;

if (isCLI) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
