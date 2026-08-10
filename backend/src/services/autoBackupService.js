import fs from 'fs/promises';
import path from 'path';
import { query } from '../database/pool.js';
import { getCloudConfig, uploadBackupToCloud } from './cloudBackupService.js';
import { sendAlert } from './notificationService.js';
import { encrypt } from '../utils/crypto.js';

const getAutoBackupDir = () =>
  process.env.AUTO_BACKUP_DIR || path.join(process.cwd(), 'backups', 'auto-backups');

const ensureDir = async () => {
  try {
    await fs.mkdir(getAutoBackupDir(), { recursive: true });
  } catch (_) {}
};

/**
 * دالة لتنظيف النسخ القديمة وفق سياسة GFS (الجد-الأب-الابن)
 * - الاحتفاظ بكافة النسخ لآخر 24 ساعة
 * - الاحتفاظ بنسخة يومية واحدة لآخر 30 يوماً
 * - الاحتفاظ بنسخة أسبوعية واحدة لآخر 12 أسبوعاً (84 يوماً)
 */
const cleanupOldBackups = async () => {
  try {
    const autoBackupDir = getAutoBackupDir();
    const files = await fs.readdir(autoBackupDir);
    const backupFiles = files.filter((f) => f.startsWith('auto-backup-') && f.endsWith('.json'));

    if (backupFiles.length === 0) return;

    // جلب تفاصيل التواريخ لكل ملف
    const fileStats = await Promise.all(
      backupFiles.map(async (f) => {
        const filePath = path.join(autoBackupDir, f);
        const st = await fs.stat(filePath);
        return { name: f, path: filePath, mtime: st.mtime };
      }),
    );

    // الترتيب من الأحدث إلى الأقدم لضمان أننا نبقي أحدث نسخة في اليوم/الأسبوع
    fileStats.sort((a, b) => b.mtime - a.mtime);

    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const keptFiles = new Set();
    const dailyBuckets = new Set();
    const weeklyBuckets = new Set();

    for (const file of fileStats) {
      const fileDate = new Date(file.mtime);
      const ageDays = (now - fileDate) / ONE_DAY;

      // 1. الاحتفاظ بكل نسخ آخر 24 ساعة
      if (ageDays <= 1) {
        keptFiles.add(file.name);
        continue;
      }

      // 2. الاحتفاظ بنسخة يومية لمدة 30 يوم
      const dayKey = fileDate.toISOString().split('T')[0];
      if (ageDays <= 30) {
        if (!dailyBuckets.has(dayKey)) {
          dailyBuckets.add(dayKey);
          keptFiles.add(file.name);
        }
        continue;
      }

      // 3. الاحتفاظ بنسخة أسبوعية لمدة 12 أسبوع (84 يوم)
      const d = new Date(Date.UTC(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
      const weekKey = `${d.getUTCFullYear()}-W${weekNo}`;

      if (ageDays <= 84) {
        if (!weeklyBuckets.has(weekKey)) {
          weeklyBuckets.add(weekKey);
          keptFiles.add(file.name);
        }
        continue;
      }

      // ما عدا ذلك سيتم حذفه
    }

    // حذف الملفات المستبعدة
    for (const file of fileStats) {
      if (!keptFiles.has(file.name)) {
        await fs.unlink(file.path);
        console.log(`🗑️ تم حذف نسخة احتياطية قديمة وفق سياسة GFS: ${file.name}`);
      }
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
    ];
    const out = {};
    for (const t of tables) {
      const res = await query(`SELECT * FROM ${t}`);
      out[t] = res.rows;
    }

    // صيغة التاريخ: auto-backup-YYYY-MM-DD_HH-mm-ss
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];

    const fileName = `auto-backup-${timestamp}.json`;
    const filePath = path.join(getAutoBackupDir(), fileName);
    const backupData = { meta: { created_at: now.toISOString(), is_auto: true }, data: out };
    const rawPayload = JSON.stringify(backupData);
    const encryptedPayload = encrypt(rawPayload);
    const backupJson = JSON.stringify({ encrypted: true, payload: encryptedPayload });

    await fs.writeFile(filePath, backupJson, 'utf8');

    console.log(`💾 [بن العجوز ERP] تم أخذ نسخة احتياطية تلقائية بنجاح: ${fileName}`);

    // Copy to external local path if configured in .env
    const skipExternal = process.env.AUTO_BACKUP_SKIP_EXTERNAL === '1';
    const externalPath = skipExternal ? null : process.env.LOCAL_EXTERNAL_BACKUP_PATH;
    let externalCopied = false;
    if (externalPath) {
      try {
        await fs.mkdir(externalPath, { recursive: true });
        const externalFilePath = path.join(externalPath, fileName);
        await fs.copyFile(filePath, externalFilePath);
        console.log(
          `💾 [بن العجوز ERP] تم نسخ نسخة احتياطية إضافية إلى المسار الخارجي: ${externalFilePath}`,
        );
        externalCopied = true;
      } catch (extErr) {
        console.error(`⚠️ [بن العجوز ERP] فشل نسخ الملف للمسار الخارجي المساعد:`, extErr.message);
      }
    }

    // تنظيف الفولدر من النسخ الأقدم من 30
    if (process.env.AUTO_BACKUP_SKIP_CLEANUP !== '1') {
      await cleanupOldBackups();
    }

    // 🔒 الرفع السحابي التلقائي
    let cloudUploaded = false;
    let cloudProvider = 'none';
    try {
      const cloudConfig = skipExternal ? null : await getCloudConfig();
      if (cloudConfig && cloudConfig.provider !== 'none') {
        cloudProvider = cloudConfig.provider;
        console.log(
          `☁️ [بن العجوز ERP] جاري رفع النسخة الاحتياطية سحابياً إلى (${cloudConfig.provider})...`,
        );
        const uploadRes = await uploadBackupToCloud(backupData, fileName, cloudConfig);
        if (uploadRes.success) {
          console.log(
            `✅ [بن العجوز ERP] تم رفع النسخة الاحتياطية بنجاح إلى السحابة: ${uploadRes.path || cloudConfig.provider}`,
          );
          cloudUploaded = true;
        } else {
          console.warn(`⚠️ [بن العجوز ERP] تنبيه الرفع السحابي: ${uploadRes.message}`);
        }
      }
    } catch (cloudErr) {
      console.error(
        '⚠️ [بن العجوز ERP] فشل الرفع السحابي للنسخة الاحتياطية التلقائية:',
        cloudErr.message,
      );
    }

    // Send Discord notification
    let backupMsg = `💾 تم أخذ نسخة احتياطية تلقائية بنجاح:\n\`${fileName}\``;
    if (externalCopied) backupMsg += `\n📂 تم النسخ للمسار الخارجي المساعد: \`${externalPath}\``;
    if (cloudUploaded) backupMsg += `\n☁️ تم الرفع بنجاح للسحابة: \`${cloudProvider}\``;
    if (!skipExternal) {
      await sendAlert('💾 النسخ الاحتياطي التلقائي', backupMsg, 'success');
    }
  } catch (err) {
    console.error('❌ [بن العجوز ERP] فشل النسخ الاحتياطي التلقائي الصامت:', err.message);
    if (process.env.AUTO_BACKUP_SKIP_EXTERNAL !== '1') {
      await sendAlert(
        '❌ فشل النسخ الاحتياطي التلقائي',
        `فشل النسخ الاحتياطي الصامت:\n\`${err.message}\``,
        'error',
      );
    }
  }
};

/**
 * جدولة وتفعيل النسخ الاحتياطي الصامت في الخلفية
 */
export const initAutoBackupScheduler = () => {
  if (process.env.VERCEL) return;
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
