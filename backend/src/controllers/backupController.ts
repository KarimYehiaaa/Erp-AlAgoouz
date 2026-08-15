import * as backupService from '../services/backupService.ts';
import * as cloudBackupService from '../services/cloudBackupService.ts';
import { AppError } from '../types/errors.ts';
import fs from 'fs/promises';
import path from 'path';
import { ok } from './helper.ts';

export const backup = {
  /**
   * إنشاء نسخة احتياطية جديدة من قاعدة البيانات.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  create: async (req, res, next) => {
    try {
      ok(res, await backupService.createBackup());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * قائمة النسخ الاحتياطية المتاحة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  list: async (req, res, next) => {
    try {
      ok(res, await backupService.listBackups());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * تنزيل نسخة احتياطية محددة.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  download: async (req, res, next) => {
    try {
      const p = await backupService.downloadBackupPath(req.params.name);
      return res.download(p);
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استعادة نسخة احتياطية حسب اسمها.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  restore: async (req, res, next) => {
    try {
      ok(res, await backupService.restoreBackup(req.body.name));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * استعادة قاعدة البيانات من ملف مرفوع.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  restoreFile: async (req, res, next) => {
    let filePath: string | null = null;
    try {
      if (!req.file?.buffer) throw new AppError('لم يتم رفع ملف النسخة', 400);
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      const fileName = `uploaded-restore-${Date.now()}.json`;
      filePath = path.join(process.cwd(), 'backups', fileName);
      await fs.writeFile(filePath, req.file.buffer);
      ok(res, await backupService.restoreBackup(fileName));
    } catch (e: any) {
      next(e);
    } finally {
      // حذف الملف المؤقت دائماً بعد الانتهاء — سواء نجح أو فشل
      if (filePath) await fs.unlink(filePath).catch(() => {});
    }
  },
  /**
   * مسح جميع بيانات النظام.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  clear: async (req, res, next) => {
    try {
      ok(res, await backupService.clearAllData());
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * اختبار إعدادات النسخ الاحتياطي السحابي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  cloudTest: async (req, res, next) => {
    try {
      ok(res, await cloudBackupService.testCloudBackup(req.body));
    } catch (e: any) {
      next(e);
    }
  },
  /**
   * سجل عمليات النسخ الاحتياطي.
   * @param {import('express').Request} req طلب HTTP
   * @param {import('express').Response} res استجابة HTTP
   * @param {import('express').NextFunction} next تمرير الخطأ للمعالج المركزي
   */
  getLogs: async (req, res, next) => {
    try {
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
    } catch (e: any) {
      next(e);
    }
  },
};
