import { getClient } from '../src/database/pool.ts';

async function updateDb() {
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
