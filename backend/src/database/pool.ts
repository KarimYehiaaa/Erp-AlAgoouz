import pg from 'pg';
import config from '../config/index.ts';
import { logger } from '../services/loggerService.ts';
const { Pool, types } = pg;
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => {
  if (value === null) return null;
  return parseFloat(value);
});
const connectionOptions = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: config.db.host ?? undefined,
      port: config.db.port ?? undefined,
      database: config.db.database ?? undefined,
      user: config.db.user ?? undefined,
      password: config.db.password ?? undefined,
    };
const dbSsl = config.db.ssl;
// إصلاح التجمّد: رفع سقف الاتصالات (كان 5 فتُشبع تحت الحمل) مع الاحتفاظ بمهلات الحماية
const maxConnections = process.env.VERCEL ? 3 : 10;
const pool = new Pool({
  ...connectionOptions,
  ssl: dbSsl,
  max: maxConnections,
  min: process.env.VERCEL ? 0 : 1,
  idleTimeoutMillis: process.env.VERCEL ? 2000 : 10000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  query_timeout: 30000,
  allowExitOnIdle: true,
});
pool.on('error', (err, __client) => {
  logger.error('[DB Pool] خطأ غير متوقع في اتصال قاعدة البيانات:', err.message);
});
pool.on('connect', (_client) => {
  if (process.env.NODE_ENV === 'development') {
    logger.info(`[DB Pool] اتصال جديد — إجمالي: ${pool.totalCount} / ${maxConnections}`);
  }
});
pool.on('remove', (_client) => {
  if (process.env.NODE_ENV === 'development') {
    logger.info(`[DB Pool] إزالة اتصال — متبقٍ: ${pool.totalCount}`);
  }
});
/**
 * تنفيذ استعلام مُعامل على الاتصال المشترك.
 * @param {string} text نص الاستعلام
 * @param {any[]} [params] قيم المعاملات ($1، $2...)
 * @returns {Promise<{ rows: any[], rowCount: number | null }>} نتيجة الاستعلام
 */
const query = async (
  text: string,
  params?: any[],
): Promise<{ rows: any[]; rowCount: number | null }> => {
  try {
    return await pool.query(text, params);
  } catch (err: any) {
    if (err.message && err.message.includes('EMAXCONNSESSION')) {
      logger.warn(' [DB Pool] Supabase pooler full, retrying query in 500ms...');
      await new Promise((res) => setTimeout(res, 500));
      return await pool.query(text, params);
    }
    throw err;
  }
};
const getClient = () => pool.connect();
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
const checkHealth = async () => {
  const start = Date.now();
  try {
    await pool.query('SELECT 1 AS ping');
    return {
      ok: true,
      latencyMs: Date.now() - start,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: maxConnections,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err.message,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        max: maxConnections,
      },
    };
  }
};
const closePool = async () => {
  logger.info('[DB Pool] إغلاق جميع الاتصالات...');
  await pool.end();
  logger.info('[DB Pool] تم إغلاق الـ Pool بنجاح');
};
const pool_default = pool;
export { checkHealth, closePool, pool_default as default, getClient, query, withTransaction };
