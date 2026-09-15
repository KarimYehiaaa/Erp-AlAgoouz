/**
 * scripts/bump-version.mjs — أتمتة أرقام إصدار تطبيق الموبايل
 *
 * المصدر الوحيد للأرقام: android/version.properties
 * - versionCode: رقم صحيح يزيد 1 مع كل إصدار (Google Play يرفض الأرقام المكررة/الناقصة)
 * - versionName: صيغة semver (major.minor.patch) — تظهر للمستخدم في المتجر
 *
 * الاستخدام:
 *   npm run mobile:bump            → patch (1.0.0 → 1.0.1) + versionCode +1
 *   npm run mobile:bump -- minor   → minor  (1.0.0 → 1.1.0) + versionCode +1
 *   npm run mobile:bump -- major   → major  (1.0.0 → 2.0.0) + versionCode +1
 *   npm run mobile:bump -- show    → عرض الأرقام الحالية فقط
 *
 * خيارات إضافية:
 *   --build  يبني AAB موقّعة بعد الزيادة مباشرة
 *   --tag    ينشئ git tag (مثل v1.0.1) بعد الزيادة — يتطلب git نظيف
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = path.join(root, 'android', 'version.properties');

// ─── قراءة الإصدار الحالي ────────────────────────────────────────────────
function readVersion() {
  if (!existsSync(versionFile)) {
    console.error(`[bump] الملف غير موجود: ${versionFile}`);
    process.exit(1);
  }
  const content = readFileSync(versionFile, 'utf8');
  const code = Number(content.match(/^versionCode=(\d+)$/m)?.[1]);
  const name = content.match(/^versionName=(.+)$/m)?.[1]?.trim();
  if (!Number.isInteger(code) || code < 1 || !name) {
    console.error('[bump] version.properties تالف — تأكد من وجود versionCode وversionName');
    process.exit(1);
  }
  return { code, name };
}

function writeVersion({ code, name }) {
  const content = [
    '# version.properties — المصدر الوحيد لأرقام إصدار تطبيق الموبايل',
    '# يُعدَّل تلقائيًا عبر: npm run mobile:bump -- [major|minor|patch]',
    '# versionCode يجب أن يزيد مع كل إصدار يُرفع إلى Google Play — لا يُنقص أبدًا.',
    `versionCode=${code}`,
    `versionName=${name}`,
    '',
  ].join('\n');
  writeFileSync(versionFile, content, 'utf8');
}

// ─── منطق الزيادة ────────────────────────────────────────────────────────
const arg = process.argv[2] || 'patch';
const current = readVersion();

if (arg === 'show') {
  console.log(`versionCode=${current.code}  versionName=${current.name}`);
  process.exit(0);
}

if (!['major', 'minor', 'patch'].includes(arg)) {
  console.error('[bump] الاستخدام: npm run mobile:bump -- [major|minor|patch] [--build] [--tag]');
  process.exit(1);
}

const parts = current.name.split('.').map((n) => parseInt(n, 10) || 0);
while (parts.length < 3) parts.push(0);
if (arg === 'major') {
  parts[0] += 1;
  parts[1] = 0;
  parts[2] = 0;
} else if (arg === 'minor') {
  parts[1] += 1;
  parts[2] = 0;
} else {
  parts[2] += 1;
}

const next = { code: current.code + 1, name: parts.join('.') };
writeVersion(next);

console.log(`[bump] versionCode: ${current.code} → ${next.code}`);
console.log(`[bump] versionName: ${current.name} → ${next.name}`);

// ─── إنشاء git tag (اختياري) ────────────────────────────────────────────
if (process.argv.includes('--tag')) {
  const { execFileSync } = await import('node:child_process');
  const tag = `v${next.name}`;
  try {
    execFileSync('git', ['add', 'android/version.properties'], { cwd: root });
    execFileSync(
      'git',
      ['commit', '-m', `chore(mobile): release ${next.name} (versionCode ${next.code})`],
      { cwd: root },
    );
    execFileSync('git', ['tag', tag], { cwd: root });
    console.log(`[bump] تم إنشاء tag: ${tag} (ادفعه بـ git push origin ${tag})`);
  } catch (err) {
    console.error(`[bump] فشل إنشاء الـ tag: ${err.message}`);
    process.exit(1);
  }
}

// ─── بناء AAB بعد الزيادة (اختياري) ─────────────────────────────────────
if (process.argv.includes('--build')) {
  const { spawnSync } = await import('node:child_process');
  console.log('[bump] بناء AAB موقّعة بالأرقام الجديدة...');
  const result = spawnSync('node', [path.join(root, 'scripts', 'build-aab.mjs')], {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
  process.exit(result.status || 0);
}
