/**
 * scripts/build-apk.mjs — بناء APK تجريبي للتطبيق الموبايل
 *
 * يضبط JAVA_HOME تلقائيًا:
 *  - أولوية لـ JBR المرفق مع Android Studio (مطلوب Java 21+ لمتطلبات Capacitor 8)
 *  - وإلا يستخدم JAVA_HOME الموجود في البيئة
 *
 * الاستخدام:  npm run mobile:apk
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');

/** مسارات محتملة لـ JBR (Java 21+) المرفق مع Android Studio على ويندوز. */
const jbrCandidates = [
  'C:/Program Files/Android/Android Studio/jbr',
  'C:/Program Files/Android/Android Studio Preview/jbr',
];

function resolveJavaHome() {
  if (process.env.JAVA_HOME && !process.env.FORCE_STUDIO_JBR) {
    // التحقق من الإصدار: Capacitor 8 يحتاج Java 21+
    const check = spawnSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'), ['-version'], {
      encoding: 'utf8',
    });
    const versionOut = (check.stderr || '') + (check.stdout || '');
    const match = versionOut.match(/version "(\d+)/);
    const major = match ? parseInt(match[1], 10) : 0;
    if (major >= 21) {
      console.log(`[build-apk] JAVA_HOME الحالي مناسب (Java ${major})`);
      return process.env.JAVA_HOME;
    }
    console.log(`[build-apk] JAVA_HOME الحالي Java ${major} — أقل من المطلوب (21+)، سيتم استخدام JBR من Android Studio`);
  }
  for (const candidate of jbrCandidates) {
    if (existsSync(path.join(candidate, 'bin', 'java.exe'))) {
      console.log(`[build-apk] استخدام JBR من Android Studio: ${candidate}`);
      return candidate;
    }
  }
  console.error('[build-apk] لم أجد Java 21+ — سطّب Android Studio أو اضبط JAVA_HOME يدويًا');
  process.exit(1);
}

const javaHome = resolveJavaHome();

console.log('[build-apk] بناء APK (assembleDebug)...');
const result = spawnSync('.\\gradlew.bat', ['assembleDebug', '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome },
  shell: true,
});

if (result.status !== 0) {
  console.error('[build-apk] فشل البناء');
  process.exit(result.status || 1);
}

const apkPath = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (existsSync(apkPath)) {
  console.log(`\n✅ تم البناء بنجاح: ${apkPath}`);
  console.log('   انقل الملف للموبايل وسطّبه (اسمح بالتثبيت من مصادر غير معروفة).');
} else {
  console.error('[build-apk] البناء انتهى لكن لم أجد الـ APK في المسار المتوقع');
  process.exit(1);
}
