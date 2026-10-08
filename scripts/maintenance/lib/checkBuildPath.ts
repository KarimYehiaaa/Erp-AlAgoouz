/**
 * checkBuildPath — وحدة مشتركة لفحص مسار البناء
 * تتحقق أن `npm run build` يكتب إلى `frontend/dist` (الذي يقدّمه الخادم عبر
 * resolveFrontendDist) وليس إلى `dist/` الجذر الزائد الذي كان يخدع الفحص
 * ويترك الواجهة القديمة تُقدَّم.
 *
 * تُستخدم من:
 *  - scripts/maintenance/check-build-path.ts (فحص مستقل ضمن check:local)
 *  - scripts/database/backup-system.ts (فحص قبل النسخ — لا ننسخ حالة بناء خاطئة)
 *
 * المنطق خالص قابل للاختبار: يعمل على (rootDir, fops) ولا يلمس عملية فعلية.
 */
import path from 'path';

/** واجهة fs المطلوبة للفحص (قابلة للحقن في الاختبارات). */
export interface CheckBuildPathFs {
  readFileSync: (p: string, encoding: 'utf8') => string;
  readdirSync: (p: string) => string[];
  existsSync: (p: string) => boolean;
}

/** تبعيات الفحص — افتراضيًا fs الحقيقي، أو مُحاكى في الاختبارات. */
export interface CheckBuildPathDeps {
  fops: CheckBuildPathFs;
}

/** نتيجة الفحص: رسائل الخطأ (تمنع النسخ) والتحذيرات (لا تمنع). */
export interface CheckBuildPathResult {
  errors: string[];
  warnings: string[];
}

/** قراءة ملف JSON بأمان — يعيد null عند الفشل. */
function readJson(fops: CheckBuildPathFs, p: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(fops.readFileSync(p, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildCommand(pkg: Record<string, unknown> | null): string | undefined {
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return undefined;
  const build = (scripts as Record<string, unknown>).build;
  return typeof build === 'string' && build.trim() ? build : undefined;
}

/**
 * فحص مسار البناء.
 * @param rootDir جذر المشروع (يحتوي package.json + frontend/)
 * @param deps تبعيات (fs قابل للحقن)
 * @returns errors (انتكاس حقيقي — يمنع النسخ) + warnings (ملاحظات لا تمنع)
 */
export function checkBuildPath(rootDir: string, deps: CheckBuildPathDeps): CheckBuildPathResult {
  const { fops } = deps;
  const errors: string[] = [];
  const warnings: string[] = [];
  const frontendDir = path.join(rootDir, 'frontend');

  // ① root package.json — أمر build يجب أن يستهدف الـ workspace وليس --outDir ../dist
  const rootPkg = readJson(fops, path.join(rootDir, 'package.json'));
  const rootBuild = buildCommand(rootPkg);
  if (!rootBuild) {
    errors.push('لا يوجد أمر build في root package.json');
  } else if (rootBuild.includes('--outDir')) {
    errors.push(
      `أمر build الجذر يضبط --outDir صراحةً (${rootBuild}) — يجب أن يكتب إلى frontend/dist عبر -w frontend`,
    );
  } else if (!rootBuild.includes('frontend')) {
    errors.push(`أمر build الجذر (${rootBuild}) لا يشير إلى frontend — راجعه في package.json`);
  }

  // ② frontend/package.json — build يجب ألا يضبط outDir خارجيًا
  const frontendPkg = readJson(fops, path.join(frontendDir, 'package.json'));
  const frontendBuild = buildCommand(frontendPkg);
  if (!frontendBuild) {
    errors.push('لا يوجد أمر build في frontend/package.json');
  } else if (frontendBuild.includes('--outDir')) {
    errors.push(`أمر build في frontend/package.json يضبط --outDir (${frontendBuild})`);
  }

  // ③ frontend/vite.config.* — يجب ألا يضبط outDir خارج مجلد frontend
  let viteConfigs: string[] = [];
  try {
    viteConfigs = fops
      .readdirSync(frontendDir)
      .filter((f) => /^vite\.config\.(js|ts|mjs|cjs)$/.test(f));
  } catch {
    // frontend غير موجود — errors أعلاه ستكشفه عبر package.json
  }
  if (viteConfigs.length) {
    for (const cfg of viteConfigs) {
      let content: string;
      try {
        content = fops.readFileSync(path.join(frontendDir, cfg), 'utf8');
      } catch {
        continue;
      }
      const m = content.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
      if (m) {
        const dir = m[1]!;
        if (dir.startsWith('../') || path.isAbsolute(dir)) {
          errors.push(`${cfg} يضبط outDir إلى "${dir}" — خارج frontend/dist`);
        }
      }
    }
  }

  // ④ عمليًا: frontend/dist/index.html موجود + dist الجذر بلا index.html
  if (fops.existsSync(path.join(frontendDir, 'dist', 'index.html'))) {
    // موافق
  } else {
    warnings.push('frontend/dist/index.html غير موجود — لم يُبنَ بعد (شغّل npm run build أولًا)');
  }

  if (fops.existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    warnings.push(
      'dist/index.html الجذر موجود — قد يكون أثر نشر Vercel؛ التشغيل المحلي يفضل frontend/dist. راجع تاريخ البناء عند النشر.',
    );
  }

  return { errors, warnings };
}

/**
 * طباعة نتيجة الفحص بصيغة جميلة — تُستخدم من كل السكربتات.
 * @returns true إذا نجح الفحص (لا أخطاء)
 */
export function printBuildPathResult(result: CheckBuildPathResult): boolean {
  for (const w of result.warnings) {
    console.log(`⚠️ ${w}`);
  }
  for (const e of result.errors) {
    console.error(`❌ ${e}`);
  }
  if (!result.errors.length && !result.warnings.length) {
    console.log('✅ مسار البناء سليم — npm run build → frontend/dist فقط');
  }
  return result.errors.length === 0;
}
