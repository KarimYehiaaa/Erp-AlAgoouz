import fs from 'fs/promises';
import path from 'path';
import { getClient } from '../database/pool.ts';
import { AppError } from '../types/errors.ts';
import { encrypt, decrypt } from '../utils/crypto.ts';
import { logger } from './loggerService.ts';
import {
  createBackupFileName,
  ensureBackupDirectory,
  persistEncryptedBackup,
  listStoredBackups,
  resolveStoredBackup,
} from '../utils/backupStorage.ts';
import {
  runSharedMaintenanceTask,
  withExclusiveMaintenance,
} from '../database/maintenanceBarrier.ts';

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

// Keep the catalog, recipes, prices/costs and the minimum configuration needed
// to log in and operate the shop. Everything else is historical business data.
export const RESET_PRESERVED_TABLES = Object.freeze([
  'schema_migrations',
  'roles',
  'permissions',
  'role_permissions',
  'users',
  'settings',
  'warehouses',
  'product_categories',
  'products',
  'product_units',
  'product_recipes',
  'product_recipe_items',
  'accounts',
  'pos_terminals',
  'automations',
  'workflows_nodes',
  'workflows_edges',
]);

const LEGACY_RESET_TABLES = ['purchase_items', 'supplier_payments'];
export const CLEAR_DATA_TABLES = Object.freeze(
  [...RESTORE_ORDER, ...LEGACY_RESET_TABLES].filter(
    (table) => !RESET_PRESERVED_TABLES.includes(table),
  ),
);

const BUSINESS_SEQUENCES = Object.freeze({
  seq_sales_number: 10000,
  seq_invoices_number: 10000,
  seq_purchase_invoices_number: 1000,
  seq_expenses_number: 1000,
  seq_payments_number: 1000,
  seq_journal_entries_number: 1001,
  seq_purchase_returns_number: 1001,
  seq_bank_reconciliations_number: 1001,
  seq_purchase_orders_number: 1001,
});

const ensureDir = () => ensureBackupDirectory(BACKUP_DIR);

export const BACKUP_TABLES = Object.freeze([...RESTORE_ORDER]);
const ALLOWED_RESTORE_TABLES = new Set(BACKUP_TABLES);

/** Read all application tables from one consistent, read-only database snapshot. */
export const readBackupSnapshot = async () =>
  runSharedMaintenanceTask(async () => {
    const out: Record<string, Record<string, unknown>[]> = {};
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
  });

export const buildBackupDownload = async () => {
  const out = await readBackupSnapshot();
  const rawPayload = JSON.stringify({ meta: { created_at: new Date().toISOString() }, data: out });
  const encryptedPayload = encrypt(rawPayload);
  const backupJson = JSON.stringify({ encrypted: true, payload: encryptedPayload });
  const fileName = createBackupFileName('backup');
  return { file: fileName, content: backupJson };
};

export const createBackup = async () => {
  if (process.env.VERCEL) {
    throw new AppError(
      'استخدم تنزيل النسخة مباشرة أو رفعها إلى مزود سحابي؛ هذه البيئة لا تحفظ ملفات محلية',
      409,
    );
  }
  await ensureDir();
  const backup = await buildBackupDownload();
  return persistEncryptedBackup(BACKUP_DIR, backup.file, backup.content);
};

/**
 * جلب قائمة النسخ الاحتياطية المتاحة.
 * @returns {Promise<any[]>}
 */
export const listBackups = async () => {
  if (process.env.VERCEL) return [];
  return listStoredBackups(BACKUP_DIR);
};

/**
 * الحصول على مسار ملف نسخة احتياطية للتحميل.
 * @param {string} name اسم النسخة
 * @returns {Promise<string>}
 */
export const downloadBackupPath = async (name: string) => {
  resolveBackupFilePath(name);
  try {
    return await resolveStoredBackup(BACKUP_DIR, name);
  } catch {
    throw new AppError('النسخة غير موجودة', 404);
  }
};

/**
 * Start a fresh operational period while preserving product catalog, recipes,
 * prices/costs and the configuration required to keep the application usable.
 * Unknown tables and foreign keys fail closed; no protected table is cascaded.
 * @returns {Promise<{ cleared: number }>}
 */
type MaintenanceAudit = {
  userId: number;
  username: string;
  ipAddress?: string;
  action: 'backup_restore' | 'backup_restore_file' | 'data_clear';
};

// Record success in the same transaction as the maintenance operation. A restore
// can remove its actor and revokes its session before ordinary response auditing.
const writeMaintenanceAudit = async (
  client: Awaited<ReturnType<typeof getClient>>,
  audit: MaintenanceAudit | undefined,
  result: { restored: number } | { cleared: number },
) => {
  if (!audit) return;
  await client.query(
    `INSERT INTO audit_logs (user_id,action,entity_type,new_data,ip_address)
     VALUES ((SELECT id FROM users WHERE id=$1 AND username=$2),$3,'backup',$4::jsonb,$5)`,
    [
      audit.userId,
      audit.username,
      audit.action,
      JSON.stringify({ ...result, actor_username: audit.username }),
      audit.ipAddress ?? null,
    ],
  );
};

export const clearAllData = async (audit?: MaintenanceAudit) =>
  withExclusiveMaintenance(async () => {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const tablesResult = await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      const presentTables = new Set(tablesResult.rows.map((row: any) => row.tablename));
      const knownTables = new Set([...RESET_PRESERVED_TABLES, ...CLEAR_DATA_TABLES]);
      const unknownTables = [...presentTables].filter((table) => !knownTables.has(table));
      if (unknownTables.length) {
        throw new AppError(`تعذر التصفير: جداول غير معروفة (${unknownTables.join(', ')})`, 409);
      }
      for (const table of [
        'products',
        'product_categories',
        'product_recipes',
        'product_recipe_items',
      ]) {
        if (!presentTables.has(table))
          throw new AppError(`تعذر التصفير: جدول ${table} غير موجود`, 409);
      }

      const tablesToClear = CLEAR_DATA_TABLES.filter((table) => presentTables.has(table));
      // One statement, RESTRICT: an unlisted dependent table aborts the entire reset.
      await client.query(`TRUNCATE TABLE ${tablesToClear.join(', ')} RESTART IDENTITY RESTRICT`);
      await client.query("DELETE FROM settings WHERE key LIKE 'sales_opening_balance:%'");
      await client.query(
        "UPDATE settings SET value = value - 'next_number', updated_at = NOW() WHERE key IN ('invoice', 'sale')",
      );

      const sequenceResult = await client.query(
        "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'S'",
      );
      const presentSequences = new Set(sequenceResult.rows.map((row: any) => row.relname));
      for (const [sequence, start] of Object.entries(BUSINESS_SEQUENCES)) {
        if (presentSequences.has(sequence)) {
          await client.query(`ALTER SEQUENCE ${sequence} RESTART WITH ${start}`);
        }
      }
      // Keep accounts and catalog, but invalidate credentials and cached report
      // namespaces everywhere only when the complete reset transaction commits.
      await client.query('UPDATE users SET session_generation = gen_random_uuid()');
      const result = { cleared: tablesToClear.length };
      await writeMaintenanceAudit(client, audit, result);
      await client.query('COMMIT');
      return result;
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

/**
 * استعادة نسخة احتياطية من ملف.
 * @param {string} name اسم النسخة
 * @returns {Promise<any>}
 */
export const restoreBackup = async (name: string, audit?: MaintenanceAudit) => {
  const p = await downloadBackupPath(name);
  let content;
  try {
    content = await fs.readFile(p, 'utf8');
  } catch {
    throw new AppError('النسخة غير موجودة', 404);
  }
  return restoreBackupContent(content, audit);
};

/** Restore a validated upload without requiring writable server storage. */
export const restoreBackupContent = async (content: string, audit?: MaintenanceAudit) => {
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
  return withExclusiveMaintenance(async () => {
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
      await client.query(
        `TRUNCATE TABLE ${validRestoreTables.join(', ')} RESTART IDENTITY RESTRICT`,
      );
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

      // Never restore authorization from a historical snapshot. Rotate independently
      // of token_version, even for reintroduced users and backups without this column.
      // These changes share the restore transaction: failure preserves current sessions.
      await client.query('UPDATE users SET session_generation = gen_random_uuid()');
      await client.query('UPDATE refresh_tokens SET revoked = TRUE WHERE revoked = FALSE');
      await client.query(
        'UPDATE manager_override_tokens SET used_at = NOW() WHERE used_at IS NULL',
      );

      const result = { restored: restoreTables.length };
      await writeMaintenanceAudit(client, audit, result);
      await client.query('COMMIT');
      return result;
    } catch (e: any) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
};
