/**
 * dump-roles.ts — عرض الأدوار والصلاحيات المخزنة
 * ════════════════════════════════════════════════
 * أداة تشخيص: يعرض كل صفوف `roles` و `role_permissions` من قاعدة البيانات
 * المتصلة عبر pool.ts (نفس إعدادات الخادم). مفيد للتحقق من بنية الصلاحيات
 * بعد الهجرات أو عند إعداد الأدوار.
 *
 * التشغيل: `node scripts/dump-roles.ts` (من backend)
 */
import { getClient } from '../src/database/pool.ts';

async function test(): Promise<void> {
  const client = await getClient();
  try {
    const r1 = await client.query('SELECT * FROM roles');
    console.log('ROLES:', r1.rows);
    const r2 = await client.query('SELECT * FROM role_permissions');
    console.log('PERMISSIONS:', r2.rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

test();
