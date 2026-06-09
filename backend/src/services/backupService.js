import fs from 'fs/promises';
import path from 'path';
import { query, getClient } from '../database/pool.js';
import { AppError } from '../middleware/errorHandler.js';

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
    'warehouses', 'roles', 'permissions', 'role_permissions',
    'users', 'products', 'product_categories', 'customers', 'suppliers',
    'expense_categories', 'product_recipes', 'product_recipe_items',
    'sales', 'sale_items', 'invoices', 'invoice_items',
    'payments', 'inventory', 'stock_movements',
    'expenses', 'purchase_invoices', 'purchase_invoice_items',
    'settings', 'activity_logs',
]);


const ensureDir = async () => {
    try { await fs.mkdir(BACKUP_DIR, { recursive: true }); } catch (_) { }
};

export const createBackup = async () => {
    await ensureDir();
    // BUG-18 FIX: شمل جميع الجداول الحيوية في النسخة الاحتياطية
    const tables = [
        // Master data
        'warehouses', 'roles', 'permissions', 'role_permissions',
        'users', 'products', 'product_categories', 'customers', 'suppliers',
        'expense_categories', 'product_recipes', 'product_recipe_items',
        // Transactional data
        'sales', 'sale_items', 'invoices', 'invoice_items',
        'payments', 'inventory', 'stock_movements',
        'expenses', 'purchase_invoices', 'purchase_invoice_items',
        // System
        'settings', 'activity_logs',
    ];
    const out = {};
    for (const t of tables) {
        const res = await query(`SELECT * FROM ${t}`);
        out[t] = res.rows;
    }
    const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify({ meta: { created_at: new Date().toISOString() }, data: out }, null, 2), 'utf8');
    return { file: fileName, path: filePath };
};

export const listBackups = async () => {
    await ensureDir();
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files.filter((f) => f.endsWith('.json'));
    const stats = await Promise.all(backupFiles.map(async (f) => {
        const st = await fs.stat(path.join(BACKUP_DIR, f));
        return { name: f, size: st.size, mtime: st.mtime };
    }));
    return stats.sort((a, b) => b.mtime - a.mtime);
};

export const downloadBackupPath = async (name) => {
    const p = resolveBackupFilePath(name);
    try { await fs.access(p); return p; } catch (e) { throw new AppError('النسخة غير موجودة', 404); }
};

export const clearAllData = async () => {
    // destructive: truncate operational data (keep settings, users, products, and recipes)
    const client = await getClient();
    try {
        await client.query('BEGIN');
        for (const t of CLEAR_DATA_TABLES) {
            await client.query(`TRUNCATE TABLE ${t} RESTART IDENTITY CASCADE`);
        }
        await client.query('COMMIT');
        return { cleared: CLEAR_DATA_TABLES.length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally { client.release(); }
};

export const restoreBackup = async (name) => {
    const p = resolveBackupFilePath(name);
    let content;
    try { content = await fs.readFile(p, 'utf8'); } catch (e) { throw new AppError('النسخة غير موجودة', 404); }
    const parsed = JSON.parse(content);
    const data = parsed.data || {};
    const client = await getClient();
    try {
        await client.query('BEGIN');
        for (const [table, rows] of Object.entries(data)) {
            // BUG-03 FIX: رفض أي جدول غير موجود في القائمة البيضاء — يمنع SQL Injection
            if (!ALLOWED_RESTORE_TABLES.has(table)) {
                console.warn(`[Restore] تجاهل جدول غير مصرح به: ${table}`);
                continue;
            }
            if (!Array.isArray(rows) || rows.length === 0) continue;
            await client.query(`DELETE FROM ${table}`);
            // فقط الأعمدة التي تحتوي أسماء SQL آمنة (حروف وأرقام وشرطة سفلية)
            const cols = Object.keys(rows[0]).filter(c => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c));
            const colList = cols.map((c) => `"${c}"`).join(',');
            for (const row of rows) {
                const vals = cols.map((c) => row[c]);
                const params = vals.map((_, i) => `$${i + 1}`).join(',');
                await client.query(`INSERT INTO ${table} (${colList}) VALUES (${params})`, vals);
            }
        }
        await client.query('COMMIT');
        return { restored: Object.keys(data).filter(t => ALLOWED_RESTORE_TABLES.has(t)).length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally { client.release(); }
};
