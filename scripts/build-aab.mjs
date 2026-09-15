/**
 * scripts/build-aab.mjs — بناء نسخة release موقّعة للتطبيق الموبايل
 *
 * يضبط JAVA_HOME تلقائيًا (JDK 21+ مطلوب لـ Capacitor 8 و Gradle 8.14):
 *  1. Temurin JDK 21 المثبت على النظام (إن وُجد)
 *  2. JBR المرفق مع Android Studio (إن كان إصداره مناسبًا)
 *  3. JAVA_HOME الحالي (إن كان 21+)
 *
 * الاستخدام:
 *   node scripts/build-aab.mjs          → بناء AAB (bundleRelease) — للنشر على Google Play
 *   node scripts/build-aab.mjs --apk    → بناء APK موقّع (assembleRelease) — للتوزيع المباشر
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');
const buildApk = process.argv.includes('--apk');

/** يستخرج رقم الإصدار الرئيسي من مخرجات `java -version`. */
function javaMajor(javaHome) {
  const exe = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(exe)) return 0;
  const check = spawnSync(exe, ['-version'], { encoding: 'utf8' });
  const out = (check.stderr || '') + (check.stdout || '');
  const match = out.match(/version "(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function resolveJavaHome() {
  const candidates = [
    'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot',
    'C:/Program Files/Android/Android Studio/jbr',
  ];
  // 1. JAVA_HOME الحالي إن كان 21+ — لكن ليس JBR الجديد (class file 69 يكسر Gradle)
  if (process.env.JAVA_HOME) {
    const major = javaMajor(process.env.JAVA_HOME);
    if (major >= 21 && major < 25) {
      console.log(`[build-release] استخدام JAVA_HOME (Java ${major})`);
      return process.env.JAVA_HOME;
    }
  }
  // 2. المرشحون المعروفون: Temurin 21 أولاً ثم JBR إن كان إصداره مقبولًا
  for (const candidate of candidates) {
    const major = javaMajor(candidate);
    if (major >= 21 && major < 25) {
      console.log(`[build-release] استخدام JDK من: ${candidate} (Java ${major})`);
      return candidate;
    }
  }
  console.error('[build-release] لم أجد JDK 21+ مناسبًا — سطّب Temurin JDK 21 أو اضبط JAVA_HOME');
  process.exit(1);
}

const javaHome = resolveJavaHome();
const task = buildApk ? 'assembleRelease' : 'bundleRelease';

console.log(`[build-release] بناء ${task}...`);
const result = spawnSync('.\\gradlew.bat', [task, '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: javaHome },
  shell: true,
});

if (result.status !== 0) {
  console.error('[build-release] فشل البناء');
  process.exit(result.status || 1);
}

const artifact = buildApk
  ? path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  : path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

if (existsSync(artifact)) {
  console.log(`\n✅ تم البناء والتوقيع بنجاح: ${artifact}`);
  console.log(buildApk
    ? '   للتوزيع المباشر — انسخه للموبايل وسطّبه.'
    : '   ارفعه على Google Play Console (Production → New release).');
} else {
  console.error('[build-release] البناء انتهى لكن لم أجد الملف الناتج');
  process.exit(1);
}
