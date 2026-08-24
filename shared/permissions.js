/**
 * المصدر الموحد الوحيد لخريطة تكافؤ الصلاحيات (Permission Equivalents).
 *
 * تُستهلك هذه الخريطة من:
 *  - الباكند: backend/src/middleware/auth.js (عبر expandPermissionCodes في authorize)
 *  - الواجهة: frontend/src/stores/auth.ts (عبر satisfiesPermission في hasPermission)
 *
 * الدلالة: المفتاح = صلاحية يُطلب التحقق منها، والقيمة = قائمة الأكواد التي تُرضي الطلب.
 * مثال: طلب `sales.view` يُرضيه أي مستخدم يملك `pos.view` أو `sales.view` أو `reports.view`.
 *
 * قاعدة الدمج (حتى لا تنحرف الخريطتان عن بعضهما):
 *  - القيم الأساسية مأخوذة من نسخة الباكند (الجهة المنفِّذة للصلاحية فعليًا).
 *  - المفاتيح التي كانت موجودة في الواجهة فقط (أكواد مجمّعة مثل `settings.manage`
 *    وأكواد قديمة مثل `sales.branch`) أُضيفت في الأسفل وهي محايدة للباكند —
 *    لا يطلبها أي route، وتستخدمها الواجهة لإخفاء/إظهار عناصر الـ UI.
 */

export const ADMIN_ROLES = ['admin', 'sys_admin', 'owner'];

/** @type {Record<string, string[]>} */
export const permissionEquivalents = {
  // ── Sales / POS ───────────────────────────────────────────────
  'sales.view': ['pos.view', 'sales.view', 'reports.view'],
  'sales.add': ['pos.add', 'sales.add', 'invoices.add'],
  'sales.edit': ['pos.edit', 'sales.edit', 'invoices.edit'],
  'sales.delete': ['pos.delete', 'sales.delete'],
  'pos.view': ['pos.view', 'sales.view'],
  'pos.add': ['pos.add', 'sales.add'],
  'pos.edit': ['pos.edit', 'sales.edit'],
  'pos.delete': ['pos.delete', 'sales.delete'],

  // ── Products ──────────────────────────────────────────────────
  'products.view': ['products.view'],
  'products.add': ['products.add'],
  'products.edit': ['products.edit'],
  'products.delete': ['products.delete'],

  // ── Inventory / Stocktakes ────────────────────────────────────
  'inventory.view': ['inventory.view'],
  'inventory.add': ['inventory.add'],
  'inventory.edit': ['inventory.edit'],
  'inventory.delete': ['inventory.delete'],

  // ── Customers ─────────────────────────────────────────────────
  'customers.view': ['customers.view', 'pos.view'],
  'customers.add': ['customers.add', 'pos.add'],
  'customers.edit': ['customers.edit'],
  'customers.delete': ['customers.delete'],

  // ── Suppliers ─────────────────────────────────────────────────
  'suppliers.view': ['suppliers.view'],
  'suppliers.add': ['suppliers.add'],
  'suppliers.edit': ['suppliers.edit'],
  'suppliers.delete': ['suppliers.delete'],

  // ── Invoices ──────────────────────────────────────────────────
  'invoices.view': ['invoices.view', 'pos.view', 'sales.view'],
  'invoices.add': ['invoices.add', 'pos.add', 'sales.add'],
  'invoices.edit': ['invoices.edit', 'pos.edit', 'sales.edit'],
  'invoices.delete': ['invoices.delete', 'pos.delete', 'sales.delete'],

  // ── Expenses ──────────────────────────────────────────────────
  'expenses.view': ['expenses.view'],
  'expenses.add': ['expenses.add'],
  'expenses.edit': ['expenses.edit'],
  'expenses.delete': ['expenses.delete'],

  // ── Reports / Users / Settings / HR ───────────────────────────
  'reports.view': ['reports.view'],
  'users.view': ['users.view'],
  'users.add': ['users.add'],
  'users.edit': ['users.edit'],
  'users.delete': ['users.delete'],
  'settings.view': ['settings.view'],
  'settings.edit': ['settings.edit'],
  'settings.add': ['settings.add'],
  'settings.delete': ['settings.delete'],
  'hr.view': ['hr.view', 'shifts.view'],
  'hr.add': ['hr.add', 'shifts.add'],
  'hr.pay': ['hr.pay'],
  'hr.edit': ['hr.edit', 'shifts.edit'],
  'hr.delete': ['hr.delete', 'shifts.delete'],

  // ── أكواد قديمة/مجمّعة — للواجهة فقط (لا تطلبها الـ routes) ──
  'sales.branch': ['pos.view', 'sales.view'],
  'sales.wholesale': ['pos.view', 'sales.view'],
  'sales.pos': ['pos.view', 'sales.view'],
  'sales.return': ['pos.delete', 'sales.delete'],
  'purchases.view': ['purchases.view', 'inventory.view', 'expenses.view'],
  'recipes.view': ['recipes.view', 'products.view'],
  'products.manage': ['products.view', 'products.add', 'products.edit', 'products.delete'],
  'inventory.manage': ['inventory.view', 'inventory.add', 'inventory.edit', 'inventory.delete'],
  'customers.manage': ['customers.view', 'customers.add', 'customers.edit', 'customers.delete'],
  'suppliers.manage': ['suppliers.view', 'suppliers.add', 'suppliers.edit', 'suppliers.delete'],
  'invoices.manage': ['invoices.view', 'invoices.add', 'invoices.edit', 'invoices.delete'],
  'expenses.manage': ['expenses.view', 'expenses.add', 'expenses.edit', 'expenses.delete'],
  'users.manage': ['users.view', 'users.add', 'users.edit', 'users.delete'],
  'settings.manage': ['settings.view', 'settings.add', 'settings.edit', 'settings.delete'],
  'hr.manage': [
    'shifts.view', 'shifts.add', 'shifts.edit', 'shifts.delete',
    'hr.view', 'hr.add', 'hr.edit', 'hr.delete', 'hr.pay',
  ],
};

/**
 * توسيع قائمة أكواد مطلوبة إلى مجموعة الأكواد المقبولة (للباكند).
 * @param {string[]} codes
 * @returns {string[]}
 */
export function expandPermissionCodes(codes) {
  const set = new Set();
  for (const code of codes) {
    set.add(code);
    const equivalents = permissionEquivalents[code];
    if (equivalents) {
      for (const eq of equivalents) set.add(eq);
    }
  }
  return Array.from(set);
}

/**
 * هل تملك قائمة الأكواد صلاحيةً تُرضي الكود المطلوب؟ (للـ UI)
 * @param {string[]} ownedCodes أكواد الصلاحيات الممنوحة للمستخدم
 * @param {string} code الصلاحية المطلوب التحقق منها
 * @returns {boolean}
 */
export function satisfiesPermission(ownedCodes, code) {
  if (ownedCodes.includes(code)) return true;
  const equivalents = permissionEquivalents[code];
  if (equivalents) return equivalents.some((c) => ownedCodes.includes(c));
  return false;
}
