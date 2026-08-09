import pg from 'pg';
import config from '../config/index.js';

const { Pool, types } = pg;
import type { PoolClient, QueryResult } from 'pg';

// ─── Type Parsers ──────────────────────────────────────────────────────────────
// الحفاظ على تنسيق DATE كـ YYYY-MM-DD بدون تحويل UTC
types.setTypeParser(1082, (value) => value);
// NUMERIC → string (للحفاظ على الدقة المالية) ثم يتم التحويل عند الحاجة
// ⚠️ parseFloat يسبب أخطاء تقريب (0.1 + 0.2 ≠ 0.3) — الأفضل إبقاؤها string
// ثم تحويلها بدقة عبر roundMoney() في الـ Services
types.setTypeParser(1700, (value) => {
  if (value === null) return null;
  const num = parseFloat(value);
  // تقريب لأقرب فلس (خانتان عشريتان) لتفادي أخطاء floating point
  return Math.round(num * 100) / 100;
});

// ─── Connection Options ────────────────────────────────────────────────────────
const connectionOptions = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
    };

// ─── Pool Configuration ────────────────────────────────────────────────────────
// تحديد الحد الأقصى للاتصالات حسب البيئة
const maxConnections = process.env.VERCEL ? 1 : config.db.ssl ? 10 : 60;

const pool = new Pool({
  ...connectionOptions,
  ssl: config.db.ssl,
  max: maxConnections,
  min: process.env.VERCEL ? 0 : 2, // اتصالان جاهزان دائماً (إلا Vercel)
  idleTimeoutMillis: process.env.VERCEL ? 1000 : 30000,
  connectionTimeoutMillis: 8000, // ← زيادة الـ timeout لـ Supabase
  statement_timeout: 30000, // ← 30 ثانية حد أقصى للـ Query
  query_timeout: 30000, // ← حماية إضافية على مستوى Client
  keepAlive: true, // ← منع انقطاع الاتصال الخامل
  keepAliveInitialDelayMillis: 10000,
});

// ─── Pool Event Handlers ───────────────────────────────────────────────────────
pool.on('error', (err, client) => {
  // لا نستخدم console.error مباشرة — يمر عبر loggerService
  console.error('[DB Pool] خطأ غير متوقع في اتصال قاعدة البيانات:', err.message);
  // لا نقوم بـ process.exit هنا — نترك Pool يتعافى تلقائياً
});

pool.on('connect', (_client) => {
  // تسجيل عند إنشاء اتصال جديد (debug level فقط)
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB Pool] اتصال جديد — إجمالي: ${pool.totalCount} / ${maxConnections}`);
  }
});

pool.on('remove', (_client) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[DB Pool] إزالة اتصال — متبقٍ: ${pool.totalCount}`);
  }
});

// ─── Public API ────────────────────────────────────────────────────────────────
/**
 * تنفيذ استعلام SQL مع معالجة الأخطاء التلقائية
 * @param text - نص الاستعلام
 * @param params - المعاملات
 */
export const query = <T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> => pool.query<T>(text, params);

/**
 * الحصول على اتصال منفرد من الـ Pool (للمعاملات)
 * تذكر دائماً استدعاء client.release() بعد الانتهاء
 */
export const getClient = (): Promise<PoolClient> => pool.connect();

/**
 * تنفيذ مجموعة استعلامات داخل معاملة واحدة (Transaction)
 * يُلغي تلقائياً عند الخطأ ويُنفّذ عند النجاح
 * @param fn - دالة تستقبل (client) وتُرجع Promise
 */
export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * فحص صحة الاتصال بقاعدة البيانات
 * @returns {{ ok: boolean, latencyMs: number, error?: string, poolStats: object }}
 */
export const checkHealth = async () => {
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

/**
 * إغلاق جميع اتصالات الـ Pool بشكل آمن (عند إيقاف الخادم)
 */
export const closePool = async () => {
  console.log('[DB Pool] إغلاق جميع الاتصالات...');
  await pool.end();
  console.log('[DB Pool] تم إغلاق الـ Pool بنجاح');
};

export default pool;
