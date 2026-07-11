import { getClient } from '../src/database/pool.js';
async function test() {
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
