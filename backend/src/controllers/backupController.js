import * as backupService from '../services/backupService.js';
import * as cloudBackupService from '../services/cloudBackupService.js';
import { AppError } from '../types/errors.js';
import fs from 'fs/promises';
import path from 'path';
import { ok } from './helper.js';

export const backup = {
  create: async (req, res, next) => {
    try {
      ok(res, await backupService.createBackup());
    } catch (e) {
      next(e);
    }
  },
  list: async (req, res, next) => {
    try {
      ok(res, await backupService.listBackups());
    } catch (e) {
      next(e);
    }
  },
  download: async (req, res, next) => {
    try {
      const p = await backupService.downloadBackupPath(req.params.name);
      return res.download(p);
    } catch (e) {
      next(e);
    }
  },
  restore: async (req, res, next) => {
    try {
      ok(res, await backupService.restoreBackup(req.body.name));
    } catch (e) {
      next(e);
    }
  },
  restoreFile: async (req, res, next) => {
    let filePath = null;
    try {
      if (!req.file?.buffer) throw new AppError('لم يتم رفع ملف النسخة', 400);
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      const fileName = `uploaded-restore-${Date.now()}.json`;
      filePath = path.join(process.cwd(), 'backups', fileName);
      await fs.writeFile(filePath, req.file.buffer);
      ok(res, await backupService.restoreBackup(fileName));
    } catch (e) {
      next(e);
    } finally {
      // حذف الملف المؤقت دائماً بعد الانتهاء — سواء نجح أو فشل
      if (filePath) await fs.unlink(filePath).catch(() => {});
    }
  },
  clear: async (req, res, next) => {
    try {
      ok(res, await backupService.clearAllData());
    } catch (e) {
      next(e);
    }
  },
  cloudTest: async (req, res, next) => {
    try {
      ok(res, await cloudBackupService.testCloudBackup(req.body));
    } catch (e) {
      next(e);
    }
  },
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
    } catch (e) {
      next(e);
    }
  },
};
