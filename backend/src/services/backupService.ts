import fs from 'fs/promises';
import path from 'path';
import { getClient } from '../database/pool.ts';
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

// Explicit application-table contract shared by manual backup, automatic backup and restore.
// The restore transaction disables triggers before inserting this data.
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
  'accounts',
  'financial_periods',
  'journal_entries',
  'journal_entry_lines',
  'bank_reconciliations',
  'bank_statement_transactions',
  'purchase_orders',
  'purchase_order_items',
  'purchase_returns',
  'purchase_return_items',
  'supplier_invoices',
  'partners',
  'partner_drawings',
  'menus',
  'menu_categories',
  'menu_items',
  'pos_terminals',
  'pos_shifts',
  'pos_cash_movements',
  'pos_pin_lockouts',
  'manager_approval_requests',
  'manager_override_tokens',
  'idempotency_records',
  'automations',
  'automation_logs',
  'workflows_nodes',
  'workflows_edges',
  'telegram_logs',
  'audit_logs',
];

const ensureDir = async () => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  } catch {
    // تجاهل مقصود
  }
};

export const BACKUP_TABLES = Object.freeze([...RESTORE_ORDER]);
const ALLOWED_RESTORE_TABLES = new Set(BACKUP_TABLES);

/** Read all application tables from one consistent, read-only database snapshot. */
export const readBackupSnapshot = async () => {
  const out = {};
  const client = await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const overrideTokensTable = await client.query(
      "SELECT to_regclass('public.manager_override_tokens') IS NOT NULL AS exists",
    );
    const hasManagerOverrideTokens = overrideTokensTable.rows[0]?.exists === true;
    for (const t of BACKUP_TABLES) {
      // This table was introduced after migration 071 had already been recorded
      // on some installations. Until the reconciliation migration runs, its
      // correct snapshot is empty; all other missing tables remain hard errors.
      if (t === 'manager_override_tokens' && !hasManagerOverrideTokens) {
        out[t] = [];
        continue;
      }
      const res = await client.query(`SELECT * FROM ${t}`);
      out[t] = res.rows;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return out;
};

export const createBackup = async () => {
  await ensureDir();
  const out = await readBackupSnapshot();
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
    // Permission failure aborts the transaction: let the outer handler roll it back.
    await client.query("SET LOCAL session_replication_role = 'replica'");
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
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AppError('صيغة ملف النسخة الاحتياطية غير صحيحة', 400);
  }
  if (parsed && parsed.encrypted) {
    try {
      const decrypted = decrypt(parsed.payload);
      parsed = JSON.parse(decrypted);
    } catch {
      throw new AppError('فشل فك تشفير النسخة الاحتياطية. قد يكون مفتاح التشفير غير صحيح.', 400);
    }
  }
  const data = parsed?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AppError('صيغة بيانات النسخة الاحتياطية غير صحيحة', 400);
  }
  const missingTables = BACKUP_TABLES.filter(
    (table) => !Object.prototype.hasOwnProperty.call(data, table) || !Array.isArray(data[table]),
  );
  if (missingTables.length) {
    throw new AppError(
      'النسخة الاحتياطية ناقصة ولا يمكن استعادتها بأمان. الجداول الناقصة: ' +
        missingTables.join(', '),
      400,
    );
  }
  // A snapshot has a uniform column set per table. Reject malformed data before
  // opening a connection; silently dropping later-row columns would lose data.
  for (const table of BACKUP_TABLES) {
    let expectedColumns: Set<string> | undefined;
    for (const row of data[table]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new AppError(`صف غير صالح في النسخة الاحتياطية: ${table}`, 400);
      }
      const columns = Object.keys(row);
      if (
        columns.length === 0 ||
        columns.some((column) => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) ||
        (expectedColumns &&
          (columns.length !== expectedColumns.size ||
            columns.some((column) => !expectedColumns!.has(column))))
      ) {
        throw new AppError(`أعمدة غير متوافقة في النسخة الاحتياطية: ${table}`, 400);
      }
      expectedColumns ??= new Set(columns);
    }
  }
  // Choose tables in a dependency-safe order (only those present in the backup)
  const restoreTables = RESTORE_ORDER.filter(
    (t) => ALLOWED_RESTORE_TABLES.has(t) && Object.prototype.hasOwnProperty.call(data, t),
  );
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Do not continue after permission errors or replay history with live triggers.
    await client.query("SET LOCAL session_replication_role = 'replica'");
    // تصفية الجداول المسموح بها أولاً لمنع TRUNCATE على جداول غير مصرح بها (SQL Injection)
    const validRestoreTables = restoreTables.filter((table) => {
      if (!ALLOWED_RESTORE_TABLES.has(table)) {
        logger.warn(`[Restore] تجاهل جدول غير مصرح به: ${table}`);
        return false;
      }
      return true;
    });

    // RESTRICT fails safely if a new dependent table is missing from the backup contract.
    await client.query(`TRUNCATE TABLE ${validRestoreTables.join(', ')} RESTART IDENTITY RESTRICT`);
    for (const table of validRestoreTables) {
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columnTypes = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1 AND data_type IN ('json', 'jsonb')`,
        [table],
      );
      const jsonColumns = new Set(columnTypes.rows.map((column) => column.column_name));
      // Column names and the complete row shape were validated before connecting.
      const cols = Object.keys(rows[0]);
      const colList = cols.map((c) => `"${c}"`).join(',');
      for (const row of rows) {
        // Restore history exactly: current product routing must not rewrite past movements.
        const vals = cols.map((c) =>
          jsonColumns.has(c) && row[c] !== null ? JSON.stringify(row[c]) : row[c],
        );
        const params = vals.map((_, i) => `$${i + 1}`).join(',');
        await client.query(`INSERT INTO ${table} (${colList}) VALUES (${params})`, vals);
      }
    }

    // Replica mode bypasses FK triggers. Re-enabling them does not validate
    // imported history, so check every declared FK before committing or resetting counters.
    const foreignKeys = await client.query(
      `SELECT c.conname, c.confmatchtype, child.relname AS child_table,
              parent.relname AS parent_table, pn.nspname AS parent_schema,
              array_agg(ca.attname::text ORDER BY k.ord) AS child_columns,
              array_agg(pa.attname::text ORDER BY k.ord) AS parent_columns
       FROM pg_constraint c
       JOIN pg_class child ON child.oid = c.conrelid
       JOIN pg_namespace cn ON cn.oid = child.relnamespace
       JOIN pg_class parent ON parent.oid = c.confrelid
       JOIN pg_namespace pn ON pn.oid = parent.relnamespace
       CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(child_num, parent_num, ord)
       JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = k.child_num
       JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = k.parent_num
       WHERE c.contype = 'f' AND cn.nspname = 'public' AND child.relname = ANY($1::text[])
       GROUP BY c.oid, c.conname, c.confmatchtype, child.relname, parent.relname, pn.nspname`,
      [validRestoreTables],
    );
    const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
    for (const fk of foreignKeys.rows) {
      const columns: string[] = fk.child_columns;
      const parentColumns: string[] = fk.parent_columns;
      const nonNull = columns.map((col) => `child.${quoteIdentifier(col)} IS NOT NULL`);
      // MATCH SIMPLE skips any null key; MATCH FULL permits only all-null keys.
      const applies = nonNull.join(fk.confmatchtype === 'f' ? ' OR ' : ' AND ');
      const equality = columns
        .map(
          (col, index) =>
            `parent.${quoteIdentifier(parentColumns[index]!)} = child.${quoteIdentifier(col)}`,
        )
        .join(' AND ');
      const invalid = await client.query(
        `SELECT 1 FROM public.${quoteIdentifier(fk.child_table)} child
         WHERE (${applies}) AND NOT EXISTS (
           SELECT 1 FROM ${quoteIdentifier(fk.parent_schema)}.${quoteIdentifier(fk.parent_table)} parent
           WHERE ${equality}
         ) LIMIT 1`,
      );
      if (invalid.rows.length) {
        throw new AppError(
          `علاقة غير صالحة في النسخة الاحتياطية: ${fk.child_table} (${fk.conname})`,
          400,
        );
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
      { seq: 'seq_sales_number', table: 'sales', column: 'sale_number', min: 10000 },
      { seq: 'seq_invoices_number', table: 'invoices', column: 'invoice_number', min: 10000 },
      {
        seq: 'seq_purchase_invoices_number',
        table: 'purchase_invoices',
        column: 'invoice_number',
        min: 1000,
      },
      { seq: 'seq_expenses_number', table: 'expenses', column: 'expense_number', min: 1000 },
      { seq: 'seq_payments_number', table: 'payments', column: 'payment_number', min: 1000 },
      {
        seq: 'seq_journal_entries_number',
        table: 'journal_entries',
        column: 'entry_number',
        min: 1000,
      },
      {
        seq: 'seq_purchase_orders_number',
        table: 'purchase_orders',
        column: 'po_number',
        min: 1000,
      },
      {
        seq: 'seq_purchase_returns_number',
        table: 'purchase_returns',
        column: 'return_number',
        min: 1000,
      },
      {
        seq: 'seq_bank_reconciliations_number',
        table: 'bank_reconciliations',
        column: 'reconciliation_number',
        min: 1000,
      },
    ];
    for (const item of customSequences) {
      if (validRestoreTables.includes(item.table)) {
        // Identifiers come exclusively from the fixed map above. Use the suffix,
        // not the year or row ID, and never move an existing counter backwards.
        await client.query(
          `SELECT setval($1::regclass, GREATEST(
          (SELECT last_value FROM ${item.seq}),
          COALESCE((SELECT MAX(substring(${item.column} from '([0-9]+)$')::bigint)
            FROM ${item.table}), 0), $2::bigint), true)`,
          [item.seq, item.min],
        );
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
