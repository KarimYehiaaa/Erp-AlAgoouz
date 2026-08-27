import os from 'os';
import { query, checkHealth, getClient } from '../database/pool.ts';
import logger from './loggerService.ts';

/**
 * جلب تقرير صحة النظام (النظام، الذاكرة، قاعدة البيانات، الجلسات).
 * @returns {Promise<Record<string, any>>} تقرير الصحة
 */
export const getSystemHealth = async () => {
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  let cpuUsage: number;
  if (os.platform() === 'linux') {
    const loadavg = os.loadavg();
    cpuUsage = loadavg[0] || 0;
  } else {
    const cpus = os.cpus();
    cpuUsage = cpus.reduce((acc, cpu) => acc + cpu.speed, 0) / cpus.length; // rough estimate
  }

  const memory = process.memoryUsage();

  const healthData = {
    server: {
      uptime,
      uptimeStr,
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        rssFormatted: `${Math.round(memory.rss / 1024 / 1024)} MB`,
        heapTotalFormatted: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
        heapUsedFormatted: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
      },
      cpuUsage: {
        cores: os.cpus().length,
        averageLoad: cpuUsage,
      },
      hostname: os.hostname(),
    },
    database: {
      ...(await checkHealth()),
      version: null,
      size: null,
      tableCount: null as number | null,
      activeConnections: null as number | null,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const versionRes = await query(`SHOW server_version`);
    healthData.database.version = versionRes.rows[0]?.server_version;

    const sizeRes = await query(
      `SELECT pg_size_pretty(pg_database_size(current_database())) as size`,
    );
    healthData.database.size = sizeRes.rows[0]?.size;

    const tableCountRes = await query(
      `SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    healthData.database.tableCount = parseInt(tableCountRes.rows[0]?.count || 0, 10);

    const activeConnsRes = await query(
      `SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()`,
    );
    healthData.database.activeConnections = parseInt(activeConnsRes.rows[0]?.count || 0, 10);
  } catch (err: any) {
    logger.error('Error fetching database stats for health check:', err);
  }

  return healthData;
};

/**
 * جلب قائمة الجلسات النشطة.
 * @returns {Promise<Array<Record<string, any>>>} الجلسات النشطة
 */
export const getActiveSessions = async () => {
  try {
    const res = await query(`
      SELECT rt.id, rt.user_id, u.username, u.full_name, rt.ip_address, rt.user_agent, rt.created_at, rt.expires_at
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.revoked = FALSE AND rt.expires_at > NOW()
      ORDER BY rt.created_at DESC
    `);
    return res.rows;
  } catch (err: any) {
    logger.error(`[SystemHealth] فشل جلب الجلسات النشطة: ${err.message}`);
    throw err;
  }
};

/**
 * جلب محاولات تسجيل الدخول الفاشلة خلال فترة معينة.
 * @param {number} [hours] عدد الساعات الرجعية (افتراضي 24)
 * @returns {Promise<Array<Record<string, any>>>} المحاولات الفاشلة
 */
export const getFailedLogins = async (hours = 24) => {
  try {
    const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
    const res = await query(
      `
      SELECT user_id, action_ar, details->>'ip' AS ip_address, details, created_at
      FROM activity_logs
      WHERE module = 'auth' AND action_ar LIKE '%فاشل%'
      AND created_at > NOW() - ($1 || ' hours')::interval
      ORDER BY created_at DESC LIMIT 50
    `,
      [String(safeHours)],
    );
    return res.rows;
  } catch (err: any) {
    logger.error(`[SystemHealth] فشل جلب محاولات الدخول الفاشلة: ${err.message}`);
    throw err;
  }
};

/**
 * إبطال جلسة مستخدم محددة.
 * @param {string} sessionId معرف الجلسة
 * @returns {Promise<boolean>}
 */
export const revokeSession = async (sessionId) => {
  const res = await query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1 RETURNING user_id`,
    [sessionId],
  );
  return res.rows[0];
};

/**
 * إبطال جميع جلسات مستخدم.
 * @param {number} userId معرف المستخدم
 * @returns {Promise<boolean>}
 */
export const revokeAllUserSessions = async (userId) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE RETURNING id`,
      [userId],
    );
    // رفع إصدار التوكن يبطل توكنات الوصول (8 ساعات) فوراً — ليس refresh فقط
    await client.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = $1`,
      [userId],
    );
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * جلب آخر الأنشطة المسجلة في النظام.
 * @param {number} [limit] الحد الأقصى للنتائج (افتراضي 50)
 * @returns {Promise<Array<Record<string, any>>>} الأنشطة الأخيرة
 */
export const getRecentActivity = async (limit = 50) => {
  try {
    const res = await query(
      `
      SELECT al.id, al.user_id, u.username, u.full_name, al.module, al.action_ar, al.entity_type, al.entity_id, al.ip_address, al.created_at
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC
      LIMIT $1
    `,
      [limit],
    );
    return res.rows;
  } catch (err: any) {
    logger.error(`[SystemHealth] فشل جلب النشاطات الأخيرة: ${err.message}`);
    throw err;
  }
};

/**
 * جلب إحصائيات عددية عامة عن النظام.
 * @returns {Promise<Record<string, number>>} العدادات
 */
export const getSystemCounts = async () => {
  try {
    const [usersRes, activeUsersRes, productsRes, customersRes, lowStockRes] = await Promise.all([
      query(`SELECT count(*) as count FROM users WHERE deleted_at IS NULL`),
      query(
        `SELECT count(DISTINCT user_id) as count FROM activity_logs WHERE created_at > NOW() - INTERVAL '24 hours'`,
      ),
      query(`SELECT count(*) as count FROM products WHERE deleted_at IS NULL`),
      query(`SELECT count(*) as count FROM customers WHERE deleted_at IS NULL`),
      query(
        `SELECT count(*) as count FROM products p LEFT JOIN inventory i ON p.id = i.product_id WHERE p.deleted_at IS NULL AND p.reorder_level > 0 AND COALESCE(i.quantity, 0) <= p.reorder_level`,
      ),
    ]);

    return {
      totalUsers: parseInt(usersRes.rows[0]?.count || 0, 10),
      activeUsers24h: parseInt(activeUsersRes.rows[0]?.count || 0, 10),
      totalProducts: parseInt(productsRes.rows[0]?.count || 0, 10),
      totalCustomers: parseInt(customersRes.rows[0]?.count || 0, 10),
      lowStockProducts: parseInt(lowStockRes.rows[0]?.count || 0, 10),
    };
  } catch (err: any) {
    logger.error(`[SystemHealth] فشل جلب عدادات النظام: ${err.message}`);
    throw err;
  }
};

/**
 * إصلاح تسلسلات المعرّفات (sequences) بعد الاستيراد اليدوي.
 * @returns {Promise<Record<string, any>>} نتيجة الإصلاح
 */
export const repairSequences = async () => {
  const tables = [
    'users',
    'roles',
    'permissions',
    'products',
    'product_categories',
    'product_units',
    'customers',
    'suppliers',
    'invoices',
    'invoice_items',
    'inventory',
    'sales',
    'sale_items',
    'expenses',
    'expense_categories',
    'employees',
    'employee_attendance',
    'employee_advances',
    'payroll_runs',
  ];
  const results: any[] = [];
  for (const table of tables) {
    try {
      await query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM "${table}";`,
      );
      results.push({ table, status: 'repaired' });
    } catch (err: any) {
      logger.warn(`[SystemHealth] تخطي إصلاح تسلسل الجدول ${table}: ${err.message}`);
      results.push({ table, status: 'skipped' });
    }
  }
  return { repairedCount: results.filter((r) => r.status === 'repaired').length, details: results };
};

/**
 * إنشاء لقطة نسخ احتياطي فورية للنظام.
 * @returns {Promise<Record<string, any>>} اللقطة المنشأة
 */
export const generateBackupSnapshot = async () => {
  const tables = [
    'users',
    'roles',
    'products',
    'product_categories',
    'product_units',
    'customers',
    'suppliers',
    'expenses',
    'employees',
    'inventory',
    'invoices',
    'sales',
  ];
  const snapshot = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    system: 'AlAgoouz ERP Command Center Backup',
    data: {},
  };
  for (const table of tables) {
    try {
      const res = await query(`SELECT * FROM "${table}" LIMIT 5000`);
      snapshot.data[table] = res.rows;
    } catch (err: any) {
      logger.warn(`[SystemHealth] تخطي جدول ${table} في اللقطة: ${err.message}`);
      snapshot.data[table] = [];
    }
  }
  return snapshot;
};

/**
 * جلب تقرير رادار المخاطر (مخزون منخفض، عملاء متأخرون...).
 * @returns {Promise<Record<string, any>>} التقرير
 */
export const getRiskRadarReport = async () => {
  try {
    const [overdueCustomers, lowMarginProducts, outOfStockProducts, staleInvoices] =
      await Promise.all([
        query(`
        SELECT c.id, c.name_ar, c.phone, c.current_balance
        FROM customers c
        WHERE c.deleted_at IS NULL AND c.current_balance > 0
        ORDER BY c.current_balance DESC LIMIT 5
      `),
        query(`
        SELECT p.id, p.name_ar, p.sale_price, p.purchase_price,
               ROUND(CASE WHEN p.sale_price > 0 THEN ((p.sale_price - p.purchase_price) / p.sale_price) * 100 ELSE 0 END, 1) as margin_percent
        FROM products p
        WHERE p.deleted_at IS NULL AND p.purchase_price > 0 AND p.sale_price <= p.purchase_price * 1.10
        ORDER BY margin_percent ASC LIMIT 5
      `),
        query(`
        SELECT p.id, p.name_ar, p.sku, COALESCE(i.quantity, 0) as total_qty
        FROM products p
        LEFT JOIN (SELECT product_id, SUM(quantity) as quantity FROM inventory GROUP BY product_id) i ON i.product_id = p.id
        WHERE p.deleted_at IS NULL AND COALESCE(i.quantity, 0) <= 0
        ORDER BY p.id DESC LIMIT 5
      `),
        query(`
        SELECT inv.id, inv.invoice_number, inv.total_amount,
               COALESCE((SELECT SUM(amount) FROM payments WHERE reference_type = 'invoice' AND reference_id = inv.id), 0) as paid_amount,
               inv.payment_status, COALESCE(inv.issued_at, inv.created_at) as created_at, c.name_ar as customer_name
        FROM invoices inv
        LEFT JOIN customers c ON c.id = inv.customer_id
        WHERE inv.deleted_at IS NULL AND inv.payment_status IN ('unpaid', 'partial')
        AND COALESCE(inv.issued_at, inv.created_at) < NOW() - INTERVAL '30 days'
        ORDER BY COALESCE(inv.issued_at, inv.created_at) ASC LIMIT 5
      `),
      ]);

    return {
      overdueCustomers: overdueCustomers.rows,
      lowMarginProducts: lowMarginProducts.rows,
      outOfStockProducts: outOfStockProducts.rows,
      staleInvoices: staleInvoices.rows,
    };
  } catch (err: any) {
    logger.error(`[SystemHealth] فشل جلب رادار المخاطر: ${err.message}`);
    throw err;
  }
};

/**
 * حذف سجلات التدقيق الأقدم من عدد أيام محدد.
 * @param {number} [days] عدد الأيام (افتراضي 90)
 * @returns {Promise<number>} عدد السجلات المحذوفة
 */
export const purgeOldAuditLogs = async (days = 90) => {
  const d = Math.max(7, Number(days) || 90);
  const res = await query(
    `DELETE FROM activity_logs WHERE created_at < NOW() - ($1::int * interval '1 day')`,
    [d],
  );
  return { deletedCount: res.rowCount || 0 };
};

let currentBroadcast = {
  title: '',
  message: '',
  level: 'info',
  active: false,
  date: null as string | null,
};

/**
 * تعيين رسالة بث عامة تعرض لجميع المستخدمين.
 * @param {string} title عنوان الرسالة
 * @param {string} message نص الرسالة
 * @param {'info' | 'warning' | 'danger'} [level] مستوى الخطورة
 * @returns {Record<string, any>} الرسالة المحددة
 */
export const setBroadcast = (title, message, level = 'info') => {
  currentBroadcast = {
    title,
    message,
    level,
    active: Boolean(message),
    date: new Date().toISOString(),
  };
  return currentBroadcast;
};

/**
 * جلب رسالة البث الحالية.
 * @returns {Record<string, any> | null} الرسالة الحالية أو null
 */
export const getBroadcast = () => currentBroadcast;
