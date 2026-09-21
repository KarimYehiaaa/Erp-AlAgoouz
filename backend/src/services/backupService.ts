import fs from 'fs/promises';
import path from 'path';
import { query, getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { encrypt, decrypt } from '../utils/crypto.ts';
import { logger } from './loggerService.ts';

const BACKUP_DIR = path.join(process.cwd(), 'backups');

const resolveBackupFilePath = (name) => {
  const rawName = String(name || '');
  const fileName = path.basename(rawName);

  if (!fileName || fileName !== rawName || fileName.includes('..') || !fileName.endsWith('.json')) {
    throw new AppError('Invalid backup file name', 400);
  }

  const resolved = path.resolve(BACKUP_DIR, fileName);
  const backupRoot = path.resolve(BACKUP_DIR) + path.sep;
  if (!resolved.startsWith(backupRoot)) {
    throw new AppError('Invalid backup file name', 400);
  }

  return resolved;
};

/** قائمة الجداول التي تُمسح عند إعادة تعيين بيانات النظام (بالترتيب الصحيح للعلاقات). */
export const CLEAR_DATA_TABLES = [
  'sale_items',
  'sales',
  'invoices',
  'invoice_items',
  'payments',
  'inventory',
  'stock_movements',
  'expenses',
  'purchase_invoice_items',
  'purchase_invoices',
];

// BUG-03 FIX: قائمة بيضاء للجداول المسموح باستعادتها — يمنع SQL Injection
const ALLOWED_RESTORE_TABLES = new Set([
  'warehouses',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'products',
  'product_categories',
  'customers',
  'suppliers',
  'expense_categories',
  'product_recipes',
  'product_recipe_items',
  'sales',
  'sale_items',
  'invoices',
  'invoice_items',
  'payments',
  'inventory',
  'stock_movements',
  'expenses',
  'purchase_invoices',
  'purchase_invoice_items',
  'settings',
  'activity_logs',
  'stocktakes',
  'stocktake_items',
  'refresh_tokens',
  'db_row_audits',
  'product_units',
  'inventory_cost_layers',
  'inventory_cost_layer_consumptions',
  'notifications',
  'employee_shifts',
  'employees',
  'employee_attendance',
  'employee_advances',
  'payroll_runs',
  'payroll_items',
]);

// Ordered list to respect foreign-key dependencies when restoring
const RESTORE_ORDER = [
  // Master / lookup tables first
  'warehouses',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'product_categories',
  'products',
  'customers',
  'suppliers',
  'expense_categories',
  // Shifts and employees
  'employee_shifts',
  'employees',
  // Recipes depend on products
  'product_recipes',
  'product_recipe_items',
  // Purchase -> invoice items
  'purchase_invoices',
  'purchase_invoice_items',
  // Sales and invoices
  'sales',
  'sale_items',
  'invoices',
  'invoice_items',
  'payments',
  // Inventory & movements
  'inventory',
  'stock_movements',
  'expenses',
  // HR transaction tables (depend on employees and expenses)
  'employee_attendance',
  'employee_advances',
  'payroll_runs',
  'payroll_items',
  // System
  'settings',
  'activity_logs',
  'refresh_tokens',
  'db_row_audits',
  'notifications',
  'product_units',
  'inventory_cost_layers',
  'inventory_cost_layer_consumptions',
  'stocktakes',
  'stocktake_items',
];

const ensureDir = async () => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch {
    // تجاهل مقصود
  }
};

/**
 * إنشاء نسخة احتياطية كاملة لقاعدة البيانات.
 * @returns {Promise<{ path: string, size: number }>}
 */
export const createBackup = async () => {
  await ensureDir();
  // BUG-18 FIX: شمل جميع الجداول الحيوية في النسخة الاحتياطية
  const tables = [
    // Master data
    'warehouses',
    'roles',
    'permissions',
    'role_permissions',
    'users',
    'products',
    'product_categories',
    'customers',
    'suppliers',
    'expense_categories',
    'product_recipes',
    'product_recipe_items',
    'employee_shifts',
    'employees',
    // Transactional data
    'sales',
    'sale_items',
    'invoices',
    'invoice_items',
    'payments',
    'inventory',
    'stock_movements',
    'expenses',
    'purchase_invoices',
    'purchase_invoice_items',
    'employee_attendance',
    'employee_advances',
    'payroll_runs',
    'payroll_items',
    // System
    'settings',
    'activity_logs',
    'refresh_tokens',
    'db_row_audits',
    'notifications',
    'product_units',
    'inventory_cost_layers',
    'inventory_cost_layer_consumptions',
    'stocktakes',
    'stocktake_items',
  ];
  const out = {};
  for (const t of tables) {
    const res = await query(`SELECT * FROM ${t}`);
    out[t] = res.rows;
  }
  const rawPayload = JSON.stringify({ meta: { created_at: new Date().toISOString() }, data: out });
  const encryptedPayload = encrypt(rawPayload);
  const backupJson = JSON.stringify({ encrypted: true, payload: encryptedPayload });

  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  await fs.writeFile(filePath, backupJson, 'utf8');
  return { file: fileName, path: filePath };
};

/**
 * جلب قائمة النسخ الاحتياطية المتاحة.
 * @returns {Promise<any[]>}
 */
export const listBackups = async () => {
  await ensureDir();
  const files = await fs.readdir(BACKUP_DIR);
  const backupFiles = files.filter((f) => f.endsWith('.json'));
  const stats = await Promise.all(
    backupFiles.map(async (f) => {
      const st = await fs.stat(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, mtime: st.mtime };
    }),
  );
  return stats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
};

/**
 * الحصول على مسار ملف نسخة احتياطية للتحميل.
 * @param {string} name اسم النسخة
 * @returns {Promise<string>}
 */
export const downloadBackupPath = async (name: string) => {
  const p = resolveBackupFilePath(name);
  try {
    await fs.access(p);
    return p;
  } catch {
    throw new AppError('النسخة غير موجودة', 404);
  }
};

/**
 * مسح كل بيانات النظام (إعادة ضبط) — للمدير فقط.
 * @returns {Promise<{ cleared: string[] }>}
 */
export const clearAllData = async () => {
  // destructive: truncate operational data (keep settings, users, products, and recipes)
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Temporarily disable triggers/constraints that are enforced by triggers
    // This helps importing data that may violate business-enforced triggers
    // during a direct restore. Will be automatically reset when transaction ends.
    try {
      await client.query("SET LOCAL session_replication_role = 'replica'");
    } catch {
      // If we cannot change role, continue and rely on careful ordering
      logger.warn(
        '[Restore] could not set session_replication_role, continuing with triggers enabled',
      );
    }
    for (const t of CLEAR_DATA_TABLES) {
      await client.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
    }
    await client.query('COMMIT');
    return { cleared: CLEAR_DATA_TABLES.length };
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * استعادة نسخة احتياطية من ملف.
 * @param {string} name اسم النسخة
 * @returns {Promise<any>}
 */
export const restoreBackup = async (name: string) => {
  const p = resolveBackupFilePath(name);
  let content;
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {
    throw new AppError('النسخة غير موجودة', 404);
  }
  let parsed = JSON.parse(content);
  if (parsed && parsed.encrypted) {
    try {
      const decrypted = decrypt(parsed.payload);
      parsed = JSON.parse(decrypted);
    } catch {
      throw new AppError('فشل فك تشفير النسخة الاحتياطية. قد يكون مفتاح التشفير غير صحيح.', 400);
    }
  }
  const data = parsed.data || {};
  // Choose tables in a dependency-safe order (only those present in the backup)
  const restoreTables = RESTORE_ORDER.filter(
    (t) => ALLOWED_RESTORE_TABLES.has(t) && Object.prototype.hasOwnProperty.call(data, t),
  );
  // build helper maps from backup data to fix business-rule-sensitive rows during restore
  const productPrimaryMap = new Map();
  if (Array.isArray(data.products)) {
    for (const p of data.products) {
      if (p && typeof p.id !== 'undefined')
        productPrimaryMap.set(p.id, p.primary_warehouse_id || null);
    }
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL session_replication_role = 'replica'");
    } catch {
      logger.warn(
        '[Restore] could not set session_replication_role, continuing with triggers enabled',
      );
    }
    // تصفية الجداول المسموح بها أولاً لمنع TRUNCATE على جداول غير مصرح بها (SQL Injection)
    const validRestoreTables = restoreTables.filter((table) => {
      if (!ALLOWED_RESTORE_TABLES.has(table)) {
        logger.warn(`[Restore] تجاهل جدول غير مصرح به: ${table}`);
        return false;
      }
      return true;
    });

    for (const table of [...validRestoreTables].reverse()) {
      await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }
    for (const table of validRestoreTables) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // فقط الأعمدة التي تحتوي أسماء SQL آمنة (حروف وأرقام وشرطة سفلية)
      const cols = Object.keys(rows[0]).filter((c) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
      const colList = cols.map((c) => `"${c}"`).join(',');
      for (const row of rows) {
        // Fix production output movements to use product primary warehouse if present
        if (table === 'stock_movements' && row && row.movement_type === 'production') {
          const prodId = row.product_id;
          const primaryWh = productPrimaryMap.get(prodId);
          if (primaryWh && row.to_warehouse_id !== primaryWh) {
            row.to_warehouse_id = primaryWh;
          }
        }
        const vals = cols.map((c) => row[c]);
        const params = vals.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`INSERT INTO ${table} (${colList}) VALUES (${params})`, vals);
      }
    }

    // إعادة ضبط متسلسلات (Sequences) الجداول لقيمتها القصوى بعد الإدراج لمنع خطأ المفاتيح المكررة
    for (const table of validRestoreTables) {
      const idColumn = await client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'
         LIMIT 1`,
        [table],
      );
      // بعض جداول الربط (مثل role_permissions) لا تحتوي على id أو sequence.
      if (!idColumn.rows[0]) continue;
      await client.query(`
        DO $$
        DECLARE
          seq_name text;
        BEGIN
          seq_name := pg_get_serial_sequence('${table}', 'id');
          IF seq_name IS NOT NULL THEN
            EXECUTE format('SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM %I), 0), 1))', seq_name, '${table}');
          END IF;
        END $$;
      `);
    }

    // إعادة ضبط المتسلسلات المخصصة
    const customSequences = [
      { seq: 'seq_sales_number', table: 'sales', min: 10000 },
      { seq: 'seq_invoices_number', table: 'invoices', min: 10000 },
      { seq: 'seq_purchase_invoices_number', table: 'purchase_invoices', min: 1000 },
      { seq: 'seq_expenses_number', table: 'expenses', min: 1000 },
      { seq: 'seq_payments_number', table: 'payments', min: 1000 },
    ];
    for (const item of customSequences) {
      if (validRestoreTables.includes(item.table)) {
        await client.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = '${item.seq}') THEN
              EXECUTE format('SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(id) FROM %I), 0), ${item.min}))', '${item.seq}', '${item.table}');
            END IF;
          END $$;
        `);
      }
    }

    await client.query('COMMIT');
    return { restored: restoreTables.length };
  } catch (e: any) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};
