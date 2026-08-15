import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * يحدّد مجلد الواجهة المبنية (dist) الذي سيقدّمه الخادم.
 *
 * يقبل فقط المجلدات التي تحتوي فعليًا على `index.html` — حتى لا يلتقط
 * بقايا builds خاطئة (مثل `backend/dist` الناتج عن تشغيل tsc بالخطأ)
 * التي تخدع الفحص وتجعل الواجهة تُقدَّم بصفحة 404.
 *
 * @param {string} cwd دليل العمل الحالي (يُستخدم في الاختبارات لضبط سيناريوهات)
 * @returns {string | null} المسار الكامل لمجلد الواجهة المبنية، أو null إن لم يوجد
 */
export const resolveFrontendDist = (cwd: string = process.cwd()): string | null => {
  const candidates = [
    path.join(cwd, 'dist'),
    path.join(cwd, 'frontend/dist'),
    path.join(__dirname, '../dist'),
    path.join(__dirname, '../../frontend/dist'),
    path.join(__dirname, '../../../frontend/dist'),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || null;
};
