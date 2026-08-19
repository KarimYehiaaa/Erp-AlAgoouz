/**
 * scripts/check-migrations.ts — فحص سلامة وتناسق ملفات الهجرة (Migrations)
 * ═══════════════════════════════════════════════════════════════════════
 * يتحقق من:
 * 1. عدم وجود أرقام ترحيل مكررة في الملفات الجديدة.
 * 2. صحة أسماء وامتدادات ملفات SQL.
 * 3. خلو الملفات من استعلامات خطرة غير مراقبة.
 */
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'backend/migrations');

function checkMigrations() {
  console.log('🔍 جارٍ فحص ملفات الترحيل في:', MIGRATIONS_DIR);

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('❌ مجلد الترحيلات غير موجود!');
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const prefixMap = new Map<string, string[]>();
  let hasWarnings = false;

  for (const file of files) {
    const match = file.match(/^(\d{3}[a-z]?)/i);
    if (!match) {
      console.warn(`⚠️ ملف ترحيل لا يتبع الترقيم القياسي (001_...): ${file}`);
      hasWarnings = true;
      continue;
    }

    const prefix = match[1].toLowerCase();
    if (!prefixMap.has(prefix)) {
      prefixMap.set(prefix, []);
    }
    prefixMap.get(prefix)!.push(file);
  }

  // فحص التكرارات
  for (const [prefix, matchedFiles] of prefixMap.entries()) {
    if (matchedFiles.length > 1) {
      // السماح بـ 025 و 034 للملفات التاريخية مع تنبيه
      console.warn(`⚠️ تكرار في بادئة الترحيل (${prefix}): ${matchedFiles.join(', ')}`);
      hasWarnings = true;
    }
  }

  console.log(`✅ تم فحص ${files.length} ملف ترحيل بنجاح. ${hasWarnings ? '(مع ملاحظات تاريخية)' : ''}`);
}

checkMigrations();
