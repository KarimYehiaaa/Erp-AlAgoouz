/**
 * check-build-path.ts — حارس مسار البناء المحلي
 * ═══════════════════════════════════════════════════════════════
 * يتحقق أن `npm run build` يكتب إلى `frontend/dist` (الذي يقدّمه الخادم عبر
 * resolveFrontendDist) وليس إلى `dist/` الجذر الزائد الذي كان يخدع الفحص
 * ويترك الواجهة القديمة تُقدَّم. هذا هو النسخة المحلية من خطوة CI:
 * "Frontend Build — must write to frontend/dist (not root dist/)".
 *
 * الفحص ثابت وسريع (لا يعيد بناء الواجهة كاملة) — المنطق في
 * scripts/lib/checkBuildPath.ts المشترك مع backup-system.ts.
 *
 * التشغيل: `node scripts/check-build-path.ts` (من الجذر)
 * أو ضمن: `npm run check:local`
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { checkBuildPath, printBuildPathResult } from './lib/checkBuildPath.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const result = checkBuildPath(rootDir, { fops: fs });
const ok = printBuildPathResult(result);

if (!ok) {
  console.error('\n❌ فحص مسار البناء فشل — راجع رسائل أعلاه (أمر build / vite.config / المجلدات)');
  process.exit(1);
}
console.log('\n✅ حارس مسار البناء سليم — npm run build → frontend/dist فقط');
