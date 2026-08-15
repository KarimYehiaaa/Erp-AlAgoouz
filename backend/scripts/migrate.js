import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import logger from '../src/services/loggerService.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localPgFile = path.join(__dirname, '../../.postgres.local');
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}

const { Client } = pg;

export async function runMigrations() {
  const connectionOptions = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'erp_user',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bin_al_ajouz',
      };

  const isSsl = process.env.DB_SSL === 'true' || 
                !!process.env.DATABASE_URL || 
                (connectionOptions.host && typeof connectionOptions.host === 'string' && 
                 (connectionOptions.host.includes('supabase') || connectionOptions.host.includes('neon')));

  const client = new Client({
    ...connectionOptions,
    ...(isSsl && { ssl: { rejectUnauthorized: false } }),
  });

  try {
    await client.connect();
    logger.info('🔄 [بن العجوز ERP] جاري فحص وتحديث جداول قاعدة البيانات (Migrations)...');

    // Create schema_migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Check if users table exists (indicates db is already setup)
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      )
    `);

    const dbIsSetup = usersTableExists.rows[0].exists;

    // Read migrations directory
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    // Get applied migrations
    const appliedRes = await client.query(`SELECT version FROM schema_migrations`);
    const applied = new Set(appliedRes.rows.map((row) => row.version));

    // If db is setup but schema_migrations is empty, detect which migrations are already in the DB
    if (dbIsSetup && applied.size === 0) {
      logger.info('[بن العجوز ERP] قاعدة البيانات مهيأة مسبقاً. جاري فحص الهجرات المطبقة بالفعل...');
      
      const checkTable = async (tableName) => {
        const res = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
          )
        `, [tableName]);
        return res.rows[0].exists;
      };

      const hasStocktake = await checkTable('stocktake_items'); // 024
      const hasPayroll = await checkTable('payroll_runs'); // 022
      const hasPurchases = await checkTable('purchase_invoices'); // 011

      let maxMigrationToMark = '009_';
      if (hasStocktake) {
        maxMigrationToMark = '024_';
      } else if (hasPayroll) {
        maxMigrationToMark = '022_';
      } else if (hasPurchases) {
        maxMigrationToMark = '011_';
      }

      logger.info(`[بن العجوز ERP] تم تحديد الهجرات المطبقة بالفعل تلقائياً حتى: ${maxMigrationToMark}`);

      for (const file of files) {
        if (file <= maxMigrationToMark || file.startsWith(maxMigrationToMark)) {
          await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
          applied.add(file);
          logger.info(`  → تم تسجيل الهجرة كمنفذة مسبقاً: ${file}`);
        }
      }
    }

    let appliedCount = 0;

    // Apply pending migrations
    for (const file of files) {
      if (!applied.has(file)) {
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
          throw new Error(`فشلت الهجرة ${file}: ${err.message}`);
        }
      }
    }

    if (appliedCount > 0) {
      logger.info(`✅ [بن العجوز ERP] تم تطبيق (${appliedCount}) هجرات جديدة بنجاح.`);
    } else {
      logger.info('✅ [بن العجوز ERP] قاعدة البيانات محدثة بالكامل ولا توجد هجرات معلقة.');
    }
  } catch (err) {
    logger.error('❌ [بن العجوز ERP] فشل تحديث قاعدة البيانات: %s', err.message);
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// Run directly if executed from command line
const isCLI = process.argv[1] && process.argv[1] !== '' ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) : false;

if (isCLI) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
