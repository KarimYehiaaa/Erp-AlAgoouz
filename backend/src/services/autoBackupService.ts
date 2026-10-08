import fs from 'fs/promises';
import path from 'path';
import { readBackupSnapshot } from './backupService.ts';
import { getCloudConfig, uploadBackupToCloud } from './cloudBackupService.ts';
import { sendAlert } from './notificationService.ts';
import { encrypt } from '../utils/crypto.ts';
import { enqueueBackup } from '../jobs/queue.ts';
import { logger } from './loggerService.ts';
import { runSharedMaintenanceTask } from '../database/maintenanceBarrier.ts';
import {
  createBackupFileName,
  ensureBackupDirectory,
  persistEncryptedBackup,
  listStoredBackups,
} from '../utils/backupStorage.ts';

const getAutoBackupDir = () =>
  process.env.AUTO_BACKUP_DIR || path.join(process.cwd(), 'backups', 'auto-backups');

const ensureDir = () => ensureBackupDirectory(getAutoBackupDir());
let initialBackupTimer: ReturnType<typeof setTimeout> | null = null;
let recurringBackupTimer: ReturnType<typeof setInterval> | null = null;
let scheduledBackup: Promise<void> | null = null;

/**
 * دالة لتنظيف النسخ القديمة وفق سياسة GFS (الجد-الأب-الابن)
 * - الاحتفاظ بكافة النسخ لآخر 24 ساعة
 * - الاحتفاظ بنسخة يومية واحدة لآخر 30 يوماً
 * - الاحتفاظ بنسخة أسبوعية واحدة لآخر 12 أسبوعاً (84 يوماً)
 */
const cleanupOldBackups = async () => {
  const autoBackupDir = await ensureDir();
  const fileStats = (await listStoredBackups(autoBackupDir))
    .filter((file) => file.name.startsWith('auto-backup-'))
    .map((file) => ({ ...file, path: path.join(autoBackupDir, file.name) }));

  // الترتيب من الأحدث إلى الأقدم لضمان أننا نبقي أحدث نسخة في اليوم/الأسبوع
  fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  const now = new Date();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const keptFiles = new Set();
  const dailyBuckets = new Set();
  const weeklyBuckets = new Set();

  for (const file of fileStats) {
    const fileDate = new Date(file.mtime);
    const ageDays = (now.getTime() - fileDate.getTime()) / ONE_DAY;

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
    const d = new Date(
      Date.UTC(fileDate.getUTCFullYear(), fileDate.getUTCMonth(), fileDate.getUTCDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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
      logger.info(` تم حذف نسخة احتياطية قديمة وفق سياسة GFS: ${file.name}`);
    }
  }
};

/**
 * دالة إنشاء نسخة احتياطية تلقائية صامتة
 */
/**
 * تنفيذ نسخة احتياطية تلقائية (مع تنظيف النسخ القديمة والرفع السحابي).
 * @returns {Promise<any>}
 */
export const runAutoBackup = async () =>
  runSharedMaintenanceTask(async () => {
    try {
      await ensureDir();
      const out = await readBackupSnapshot();

      const now = new Date();
      const fileName = createBackupFileName('auto-backup', now);
      const backupData = { meta: { created_at: now.toISOString(), is_auto: true }, data: out };
      const rawPayload = JSON.stringify(backupData);
      const encryptedPayload = encrypt(rawPayload);
      const backupJson = JSON.stringify({ encrypted: true, payload: encryptedPayload });

      const saved = await persistEncryptedBackup(getAutoBackupDir(), fileName, backupJson);
      const warnings: Array<'external' | 'retention' | 'cloud' | 'notification'> = [];

      logger.info(` [بن العجوز ERP] تم أخذ نسخة احتياطية تلقائية بنجاح: ${fileName}`);

      // Copy to external local path if configured in .env
      const skipExternal = process.env.AUTO_BACKUP_SKIP_EXTERNAL === '1';
      const externalPath = skipExternal ? null : process.env.LOCAL_EXTERNAL_BACKUP_PATH;
      let externalCopied = false;
      if (externalPath) {
        try {
          const external = await persistEncryptedBackup(externalPath, fileName, backupJson);
          logger.info(
            ` [بن العجوز ERP] تم نسخ نسخة احتياطية إضافية إلى المسار الخارجي: ${external.path}`,
          );
          externalCopied = true;
        } catch (extErr: any) {
          warnings.push('external');
          logger.error(` [بن العجوز ERP] فشل نسخ الملف للمسار الخارجي المساعد:`, extErr.message);
        }
      }

      // تنظيف الفولدر من النسخ الأقدم من 30
      if (process.env.AUTO_BACKUP_SKIP_CLEANUP !== '1') {
        try {
          await cleanupOldBackups();
        } catch (error: unknown) {
          warnings.push('retention');
          logger.error(
            'فشل تنظيف النسخ الاحتياطية القديمة:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        }
      }

      //  الرفع السحابي التلقائي
      let cloudUploaded = false;
      let cloudProvider = 'none';
      try {
        const cloudConfig = skipExternal ? null : await getCloudConfig();
        if (cloudConfig && cloudConfig.provider !== 'none') {
          cloudProvider = cloudConfig.provider;
          logger.info(
            ` [بن العجوز ERP] جاري رفع النسخة الاحتياطية سحابياً إلى (${cloudConfig.provider})...`,
          );
          const uploadRes = await uploadBackupToCloud(backupData, fileName, cloudConfig);
          if (uploadRes.success) {
            logger.info(
              ` [بن العجوز ERP] تم رفع النسخة الاحتياطية بنجاح إلى السحابة: ${uploadRes.path || cloudConfig.provider}`,
            );
            cloudUploaded = true;
          } else {
            warnings.push('cloud');
            logger.warn(` [بن العجوز ERP] تنبيه الرفع السحابي: ${uploadRes.message}`);
          }
        }
      } catch (cloudErr: any) {
        warnings.push('cloud');
        logger.error(
          ' [بن العجوز ERP] فشل الرفع السحابي للنسخة الاحتياطية التلقائية:',
          cloudErr.message,
        );
      }

      // Send Discord notification
      let backupMsg = ` تم أخذ نسخة احتياطية تلقائية بنجاح:\n\`${fileName}\``;
      if (externalCopied) backupMsg += `\n تم النسخ للمسار الخارجي المساعد: \`${externalPath}\``;
      if (cloudUploaded) backupMsg += `\n تم الرفع بنجاح للسحابة: \`${cloudProvider}\``;
      const warningMessages = {
        external: 'تعذر حفظ النسخة في المسار الخارجي المساعد.',
        retention: 'تعذر إكمال تنظيف النسخ القديمة.',
        cloud: 'تعذر إكمال الرفع السحابي.',
        notification: 'تعذر إرسال التنبيه.',
      };
      if (warnings.length)
        backupMsg += '\n' + warnings.map((warning) => warningMessages[warning]).join('\n');
      if (!skipExternal) {
        try {
          const notification = await sendAlert(
            ' النسخ الاحتياطي التلقائي',
            backupMsg,
            warnings.length ? 'warning' : 'success',
          );
          if (!notification.success) warnings.push('notification');
        } catch (error: unknown) {
          warnings.push('notification');
          logger.error(
            'تعذر إرسال تنبيه النسخ الاحتياطي:',
            error instanceof Error ? error.message : 'Unknown error',
          );
        }
      }
      return {
        ...saved,
        externalCopied,
        cloudUploaded,
        cloudProvider,
        status: warnings.length ? ('partial' as const) : ('complete' as const),
        warnings,
      };
    } catch (err: any) {
      logger.error(' [بن العجوز ERP] فشل النسخ الاحتياطي التلقائي الصامت:', err.message);
      if (process.env.AUTO_BACKUP_SKIP_EXTERNAL !== '1') {
        try {
          await sendAlert(
            ' فشل النسخ الاحتياطي التلقائي',
            `فشل النسخ الاحتياطي الصامت:\n\`${err.message}\``,
            'error',
          );
        } catch (alertError: unknown) {
          logger.error(
            'تعذر إرسال تنبيه فشل النسخ الاحتياطي:',
            alertError instanceof Error ? alertError.message : 'Unknown error',
          );
        }
      }
      throw err;
    }
  });

/**
 * جدولة وتفعيل النسخ الاحتياطي الصامت في الخلفية
 */
/**
 * تشغيل مجدول النسخ الاحتياطي التلقائي الدوري.
 * @returns {NodeJS.Timeout | null}
 */
export const initAutoBackupScheduler = () => {
  // Tests may start the complete HTTP server to verify boot and health. Never
  // let that process write snapshots or apply retention to operator backups.
  if (
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.VERCEL_URL ||
    process.env.NODE_ENV === 'test'
  )
    return;
  if (initialBackupTimer || recurringBackupTimer) return;
  // تشغيل عبر الطابور عند توفر Redis — وإلا تنفيذ مباشر
  const trigger = () => {
    if (scheduledBackup) return scheduledBackup;
    scheduledBackup = (async () => {
      try {
        const queued = await enqueueBackup('auto');
        if (!queued) await runAutoBackup();
      } catch (err: any) {
        logger.error('تعذر بدء مهمة النسخ الاحتياطي:', err.message);
      }
    })().finally(() => {
      scheduledBackup = null;
    });
    return scheduledBackup;
  };
  // 1. تشغيل نسخة احتياطية فورية عند تشغيل السيرفر
  initialBackupTimer = setTimeout(async () => {
    initialBackupTimer = null;
    logger.info(' [بن العجوز ERP] تفعيل نظام النسخ الاحتياطي الصامت المحلي...');
    await trigger();
  }, 5000); // الانتظار 5 ثوان بعد التشغيل لتفادي التداخل مع بدء الاتصالات

  // 2. جدولة أخذ نسخة دورية كل 4 ساعات (4 * 60 * 60 * 1000 مللي ثانية)
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  recurringBackupTimer = setInterval(async () => {
    await trigger();
  }, FOUR_HOURS_MS);
};

export const stopAutoBackupScheduler = () => {
  if (initialBackupTimer) clearTimeout(initialBackupTimer);
  if (recurringBackupTimer) clearInterval(recurringBackupTimer);
  initialBackupTimer = null;
  recurringBackupTimer = null;
};

/** Timer cancellation does not cancel a backup already writing or uploading. */
export const drainAutoBackupScheduler = async () => {
  stopAutoBackupScheduler();
  if (scheduledBackup) await scheduledBackup;
};
