/**
 * update-db.ts — تحديث بيانات يدوي لقاعدة البيانات
 * ═══════════════════════════════════════════════════
 * أداة صيانة: يضيف فئة مصروفات "إعدام مخزون / هالك" (slug: wastage) إن لم
 * تكن موجودة. مثال على نمط التحديثات اليدوية البسيطة عبر pool.ts.
 *
 * التشغيل: `node scripts/update-db.ts` (من backend)
 */
import { getClient } from '../src/database/pool.ts';

async function updateDb(): Promise<void> {
  const client = await getClient();
  try {
    await client.query(`
      INSERT INTO expense_categories (name_ar, slug, is_active) 
      VALUES ('إعدام مخزون / هالك', 'wastage', true) 
      ON CONFLICT (slug) DO NOTHING;
    `);
    console.log('Category added');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

updateDb();
