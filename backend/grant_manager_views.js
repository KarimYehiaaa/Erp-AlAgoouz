import { query } from './src/database/pool.js';

async function main() {
  try {
    const managerRole = await query("SELECT id FROM roles WHERE name = 'manager'");
    const roleId = managerRole.rows[0].id;
    
    // Assign ALL view permissions to Manager (role_id = 2) for all non-settings modules
    await query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT $1, id FROM permissions 
      WHERE code LIKE '%.view' AND module != 'settings'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `, [roleId]);
    
    const perms = await query('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1 ORDER BY p.code', [roleId]);
    console.log('✅ Updated Manager Perm Codes (' + perms.rows.length + ' permissions):');
    console.log(perms.rows.map(r => r.code));
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

main();
