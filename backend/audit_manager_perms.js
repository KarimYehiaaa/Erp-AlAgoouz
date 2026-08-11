import { query } from './src/database/pool.js';
import fs from 'fs';

async function main() {
  try {
    const managerRole = await query("SELECT id FROM roles WHERE name = 'manager'");
    const roleId = managerRole.rows[0].id;
    const perms = await query('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1', [roleId]);
    const managerCodes = perms.rows.map(r => r.code);
    
    console.log('--- Manager Permission Codes in DB ---');
    console.log(managerCodes);
    
    const routesContent = fs.readFileSync('src/routes/index.js', 'utf8');
    const lines = routesContent.split('\n');
    
    console.log('\n--- Checking routes requiring permissions ---');
    const missingRoutes = [];
    
    lines.forEach((line, idx) => {
      if (line.includes('authorize(') && (line.includes('router.get') || line.includes('router.post') || line.includes('router.put') || line.includes('router.delete'))) {
        const routeMatch = line.match(/router\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/);
        const authMatch = line.match(/authorize\s*\(([^)]+)\)/);
        
        if (routeMatch && authMatch) {
          const method = routeMatch[1].toUpperCase();
          const path = routeMatch[2];
          const reqPermsRaw = authMatch[1].replace(/['"\s]/g, '').split(',');
          
          if (method === 'GET') {
            const hasAccess = reqPermsRaw.some(p => managerCodes.includes(p));
            if (!hasAccess) {
              missingRoutes.push({ line: idx + 1, method, path, required: reqPermsRaw });
            }
          }
        }
      }
    });
    
    console.log('\n--- GET Routes BLOCKED for Manager ---');
    console.table(missingRoutes);
  } catch(e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

main();
