import { query } from './src/database/pool.ts';

async function main() {
  try {
    const modules = ['sales', 'purchases', 'recipes', 'hr'];
    const names = {
      sales: { view: 'عرض المبيعات', add: 'إضافة مبيعات', edit: 'تعديل مبيعات', delete: 'حذف مبيعات' },
      purchases: { view: 'عرض المشتريات', add: 'إضافة مشتريات', edit: 'تعديل مشتريات', delete: 'حذف مشتريات' },
      recipes: { view: 'عرض الوصفات والتكاليف', add: 'إضافة وصفات', edit: 'تعديل وصفات', delete: 'حذف وصفات' },
      hr: { view: 'عرض الموارد البشرية والورديات', add: 'إضافة بالموارد البشرية', edit: 'تعديل بالموارد البشرية', delete: 'حذف بالموارد البشرية' }
    };
    for (const m of modules) {
      const actions = ['view', 'add', 'edit', 'delete'];
      for (const a of actions) {
        const code = `${m}.${a}`;
        const nameAr = names[m][a];
        await query(
          'INSERT INTO permissions (code, name_ar, module) VALUES ($1, $2, $3) ON CONFLICT (code) DO UPDATE SET name_ar = $2, module = $3',
          [code, nameAr, m]
        );
      }
    }
    console.log('✅ Added missing permissions (sales, purchases, recipes, hr) successfully!');
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

main();
