import * as backupService from '../services/backupService.ts';
import * as cloudBackupService from '../services/cloudBackupService.ts';
import { AppError } from '../types/errors.ts';
import fs from 'fs/promises';
import path from 'path';
import { ok, wrap } from './helper.ts';

export const backup = {
  /**
   * إنشاء نسخة احتياطية جديدة من قاعدة البيانات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: wrap(async (req, res) => {
    ok(res, await backupService.createBackup());
  }),
  /**
   * قائمة النسخ الاحتياطية المتاحة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: wrap(async (req, res) => {
    ok(res, await backupService.listBackups());
  }),
  /**
   * تنزيل نسخة احتياطية محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  download: wrap(async (req, res) => {
    const p = await backupService.downloadBackupPath(req.params.name);
    return res.download(p);
  }),
  /**
   * استعادة نسخة احتياطية حسب اسمها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  restore: wrap(async (req, res) => {
    ok(res, await backupService.restoreBackup(req.body.name));
  }),
  /**
   * استعادة قاعدة البيانات من ملف مرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  restoreFile: wrap(async (req, res) => {
    let filePath: string | null = null;
    try {
      if (!req.file?.buffer) throw new AppError('لم يتم رفع ملف النسخة', 400);
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      const fileName = `uploaded-restore-${Date.now()}.json`;
      filePath = path.join(process.cwd(), 'backups', fileName);
      await fs.writeFile(filePath, req.file.buffer);
      ok(res, await backupService.restoreBackup(fileName));
    } finally {
      // حذف الملف المؤقت دائماً بعد الانتهاء — سواء نجح أو فشل
      if (filePath) await fs.unlink(filePath).catch(() => {});
    }
  }),
  /**
   * مسح جميع بيانات النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  clear: wrap(async (req, res) => {
    ok(res, await backupService.clearAllData());
  }),
  /**
   * اختبار إعدادات النسخ الاحتياطي السحابي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  cloudTest: wrap(async (req, res) => {
    ok(res, await cloudBackupService.testCloudBackup(req.body));
  }),
  /**
   * سجل عمليات النسخ الاحتياطي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getLogs: wrap(async (req, res) => {
    const logDir = path.join(process.cwd(), 'logs');
    const files = await fs.readdir(logDir).catch(() => []);
    const logFiles = files
      .filter((f) => f.endsWith('.log'))
      .sort()
      .reverse();

    const requestedFile = req.query.file;
    let content = '';

    if (requestedFile) {
      const safePath = path.basename(requestedFile);
      if (logFiles.includes(safePath)) {
        const filePath = path.join(logDir, safePath);
        content = await fs.readFile(filePath, 'utf8').catch(() => 'فشل قراءة الملف');
      } else {
        throw new AppError('ملف السجل غير موجود', 404);
      }
    } else if (logFiles.length > 0) {
      const latestFile = logFiles.find((f) => f.startsWith('combined-')) || logFiles[0];
      const filePath = path.join(logDir, latestFile);
      content = await fs.readFile(filePath, 'utf8').catch(() => 'فشل قراءة الملف');
    }

    ok(res, { files: logFiles, content });
  }),
};
