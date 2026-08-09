import os from 'os';
import { query, checkHealth } from '../database/pool.js';

export const getSystemHealth = async () => {
  const uptime = process.uptime();
  const uptimeStr = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  let cpuUsage = 0;
  if (os.platform() === 'linux') {
    const loadavg = os.loadavg();
    cpuUsage = loadavg[0];
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
      tableCount: null,
      activeConnections: null,
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
  } catch (err) {
    console.error('Error fetching database stats for health check:', err);
  }

  return healthData;
};

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
  } catch (err) {
    return [];
  }
};

export const getFailedLogins = async (hours = 24) => {
  try {
    const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
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
  } catch (err) {
    return [];
  }
};

export const revokeSession = async (sessionId) => {
  const res = await query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1 RETURNING user_id`,
    [sessionId],
  );
  return res.rows[0];
};

export const revokeAllUserSessions = async (userId) => {
  const res = await query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE RETURNING id`,
    [userId],
  );
  return res.rows;
};

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
  } catch (err) {
    return [];
  }
};

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
  } catch (err) {
    console.error('Error fetching system counts:', err);
    return {
      totalUsers: 0,
      activeUsers24h: 0,
      totalProducts: 0,
      totalCustomers: 0,
      lowStockProducts: 0,
    };
  }
};

export const repairSequences = async () => {
  const tables = [
    'users',
    'roles',
    'permissions',
    'products',
    'categories',
    'units',
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
  const results = [];
  for (const table of tables) {
    try {
      await query(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM "${table}";`,
      );
      results.push({ table, status: 'repaired' });
    } catch (err) {
      results.push({ table, status: 'skipped' });
    }
  }
  return { repairedCount: results.filter((r) => r.status === 'repaired').length, details: results };
};

export const generateBackupSnapshot = async () => {
  const tables = [
    'users',
    'roles',
    'products',
    'categories',
    'units',
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
    } catch (err) {
      snapshot.data[table] = [];
    }
  }
  return snapshot;
};

export const getRiskRadarReport = async () => {
  try {
    const [overdueCustomers, lowMarginProducts, outOfStockProducts, staleInvoices] =
      await Promise.all([
        query(`
        SELECT c.id, c.name, c.phone, c.current_balance
        FROM customers c
        WHERE c.deleted_at IS NULL AND c.current_balance > 0
        ORDER BY c.current_balance DESC LIMIT 5
      `),
        query(`
        SELECT p.id, p.name_ar, p.selling_price, p.cost_price,
               ROUND(CASE WHEN p.selling_price > 0 THEN ((p.selling_price - p.cost_price) / p.selling_price) * 100 ELSE 0 END, 1) as margin_percent
        FROM products p
        WHERE p.deleted_at IS NULL AND p.cost_price > 0 AND p.selling_price <= p.cost_price * 1.10
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
        SELECT inv.id, inv.invoice_number, inv.total_amount, inv.paid_amount, inv.payment_status, inv.created_at, c.name as customer_name
        FROM invoices inv
        LEFT JOIN customers c ON c.id = inv.customer_id
        WHERE inv.deleted_at IS NULL AND inv.payment_status IN ('unpaid', 'partial')
        AND inv.created_at < NOW() - INTERVAL '30 days'
        ORDER BY inv.created_at ASC LIMIT 5
      `),
      ]);

    return {
      overdueCustomers: overdueCustomers.rows,
      lowMarginProducts: lowMarginProducts.rows,
      outOfStockProducts: outOfStockProducts.rows,
      staleInvoices: staleInvoices.rows,
    };
  } catch (err) {
    console.error('Error fetching risk radar:', err);
    return {
      overdueCustomers: [],
      lowMarginProducts: [],
      outOfStockProducts: [],
      staleInvoices: [],
    };
  }
};

export const purgeOldAuditLogs = async (days = 90) => {
  const d = Math.max(7, parseInt(days, 10) || 90);
  const res = await query(
    `DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '${d} days'`,
  );
  return { deletedCount: res.rowCount || 0 };
};

let currentBroadcast = { title: '', message: '', level: 'info', active: false, date: null };

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

export const getBroadcast = () => currentBroadcast;
