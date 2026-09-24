/**
 * update_routes.ts — أداة صيانة: تحديث صلاحيات المسارات القديمة
 * ═══════════════════════════════════════════════════════════════
 * يقرأ `src/routes/index.ts` ويحوّل الصلاحيات العامة القديمة (`.manage`/legacy)
 * إلى صلاحيات محددة حسب طريقة HTTP:
 *   .get    → .view
 *   .post   → .add
 *   .put    → .edit
 *   .delete → .delete
 *
 * التشغيل: `node update_routes.ts` (من مجلد backend)
 *
 * ملاحظات مهمة:
 *  - لا يُضف إدخالات تُبدّل الصلاحية بنفسها (مثل dashboard.view → dashboard.view)
 *    — الـ regex يطابق عبر الأسطر وسيدمج التنسيق الجميل بلا أي فائدة.
 *  - يستبدل اسم الصلاحية فقط مع الاحتفاظ بكل النص المحيط (الأسطر والمسافات)
 *    حتى لا يتلف تنسيق المسارات متعددة الأسطر.
 *  - لا يكتب الملف إلا إذا تغيّر المحتوى فعليًا.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** مسار ملف المسارات الرئيسي (TypeScript بعد تحويل المشروع). */
const routesPath = path.join(__dirname, 'src', 'routes', 'index.ts');

if (!fs.existsSync(routesPath)) {
  console.error(`❌ لم يُعثر على ملف المسارات: ${routesPath}`);
  process.exit(1);
}

const originalCode = fs.readFileSync(routesPath, 'utf8');
let code = originalCode;
let changes = 0;

/**
 * قائمة التحويلات: module هو الوحدة الجديدة، legacy هو الصلاحية القديمة المطلوب استبدالها.
 * @typedef {{ module: string, legacy: string }} Replacement
 * @type {Replacement[]}
 */
const replacements: { module: string; legacy: string }[] = [
  { module: 'pos', legacy: 'sales.wholesale' },
  { module: 'pos', legacy: 'sales.pos' },
  { module: 'pos', legacy: 'sales.return' },
  { module: 'products', legacy: 'products.manage' },
  { module: 'inventory', legacy: 'inventory.manage' },
  { module: 'customers', legacy: 'customers.manage' },
  { module: 'suppliers', legacy: 'suppliers.manage' },
  { module: 'invoices', legacy: 'invoices.manage' },
  { module: 'expenses', legacy: 'expenses.manage' },
  { module: 'users', legacy: 'users.manage' },
  { module: 'settings', legacy: 'settings.manage' },
  { module: 'shifts', legacy: 'hr.manage' },
];

/** لاحقة الصلاحية الجديدة لكل طريقة HTTP. */
const methodMap: Record<string, string> = {
  get: 'view',
  post: 'add',
  put: 'edit',
  delete: 'delete',
};

for (const { module, legacy } of replacements) {
  for (const [method, suffix] of Object.entries(methodMap)) {
    // يطابق: router.METHOD(<سياق حتى authenticate> <سياق حتى authorize(<سياق> 'legacy' <سياق>))
    // ويستبدل اسم الصلاحية فقط — فيبقى كل التنسيق الأصلي (أسطر متعددة ومسافات) كما هو.
    // `[^)]*?` لا يعبر قوس الإغلاق لكنه يسمح بالأسطر الجديدة بين عناصر الاستدعاء.
    code = code.replace(
      new RegExp(
        `(router\\.${method}\\([^)]*?authenticate,)([^)]*?authorize\\([^)]*?)'${legacy}'([^)]*?\\))`,
        'g',
      ),
      (_match, ctx: string, beforeAuth: string, afterLegacy: string) => {
        changes++;
        return `${ctx}${beforeAuth}'${module}.${suffix}'${afterLegacy}`;
      },
    );
  }
}

if (changes > 0 && code !== originalCode) {
  fs.writeFileSync(routesPath, code);
  console.log(`Routes updated! (${changes} تغيير في ${routesPath})`);
} else {
  console.log('ℹ️ لا توجد أنماط صلاحيات قديمة (.manage/legacy) متبقية — لا حاجة للتحديث.');
}
