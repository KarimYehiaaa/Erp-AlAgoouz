import fs from 'fs/promises';
import path from 'path';
import { query } from '../database/pool.js';

const AUTO_BACKUP_DIR = path.join(process.cwd(), 'backups', 'auto-backups');

const ensureDir = async () => {
    try {
        await fs.mkdir(AUTO_BACKUP_DIR, { recursive: true });
    } catch (_) { }
};

/**
 * دالة لتنظيف النسخ القديمة والاحتفاظ بآخر 30 نسخة فقط
 */
const cleanupOldBackups = async () => {
    try {
        const files = await fs.readdir(AUTO_BACKUP_DIR);
        const backupFiles = files.filter(f => f.startsWith('auto-backup-') && f.endsWith('.json'));

        if (backupFiles.length <= 30) return;

        // جلب تفاصيل التواريخ لكل ملف
        const fileStats = await Promise.all(
            backupFiles.map(async (f) => {
                const filePath = path.join(AUTO_BACKUP_DIR, f);
                const st = await fs.stat(filePath);
                return { name: f, path: filePath, mtime: st.mtime };
            })
        );

        // الترتيب من الأحدث إلى الأقدم
        fileStats.sort((a, b) => b.mtime - a.mtime);

        // حذف الملفات التي تتجاوز الـ 30 نسخة
        const filesToDelete = fileStats.slice(30);
        for (const file of filesToDelete) {
            await fs.unlink(file.path);
            console.log(`🗑️ تم حذف نسخة احتياطية قديمة لتوفير المساحة: ${file.name}`);
        }
    } catch (err) {
        console.error('⚠️ فشل تنظيف النسخ الاحتياطية القديمة:', err.message);
    }
};

/**
 * دالة إنشاء نسخة احتياطية تلقائية صامتة
 */
export const runAutoBackup = async () => {
    try {
        await ensureDir();
        const tables = [
            'products', 'customers', 'suppliers', 'sales', 'sale_items', 'invoices', 'invoice_items',
            'expenses', 'expense_categories', 'inventory', 'settings', 'product_recipes', 'product_recipe_items', 'users'
        ];
        const out = {};
        for (const t of tables) {
            const res = await query(`SELECT * FROM ${t}`);
            out[t] = res.rows;
        }

        // صيغة التاريخ: auto-backup-YYYY-MM-DD_HH-mm-ss
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/T/, '_')
            .replace(/:/g, '-')
            .split('.')[0];
        
        const fileName = `auto-backup-${timestamp}.json`;
        const filePath = path.join(AUTO_BACKUP_DIR, fileName);

        await fs.writeFile(
            filePath, 
            JSON.stringify({ meta: { created_at: now.toISOString(), is_auto: true }, data: out }, null, 2), 
            'utf8'
        );

        console.log(`💾 [بن العجوز ERP] تم أخذ نسخة احتياطية تلقائية بنجاح: ${fileName}`);
        
        // تنظيف الفولدر من النسخ الأقدم من 30
        await cleanupOldBackups();
    } catch (err) {
        console.error('❌ [بن العجوز ERP] فشل النسخ الاحتياطي التلقائي الصامت:', err.message);
    }
};

/**
 * جدولة وتفعيل النسخ الاحتياطي الصامت في الخلفية
 */
export const initAutoBackupScheduler = () => {
    // 1. تشغيل نسخة احتياطية فورية عند تشغيل السيرفر
    setTimeout(async () => {
        console.log('🚀 [بن العجوز ERP] تفعيل نظام النسخ الاحتياطي الصامت المحلي...');
        await runAutoBackup();
    }, 5000); // الانتظار 5 ثوان بعد التشغيل لتفادي التداخل مع بدء الاتصالات

    // 2. جدولة أخذ نسخة دورية كل 4 ساعات (4 * 60 * 60 * 1000 مللي ثانية)
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    setInterval(async () => {
        await runAutoBackup();
    }, FOUR_HOURS_MS);
};
