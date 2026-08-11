import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routesPath = path.join(__dirname, 'src', 'routes', 'index.js');
let code = fs.readFileSync(routesPath, 'utf8');

// Replace general .manage with specific ones based on HTTP method
// .get -> .view
// .post -> .add
// .put -> .edit
// .delete -> .delete

const replacements = [
  { module: 'dashboard', legacy: 'dashboard.view' },
  { module: 'pos', legacy: 'sales.branch' },
  { module: 'pos', legacy: 'sales.wholesale' },
  { module: 'pos', legacy: 'sales.pos' },
  { module: 'pos', legacy: 'sales.return' },
  { module: 'products', legacy: 'products.manage' },
  { module: 'inventory', legacy: 'inventory.manage' },
  { module: 'customers', legacy: 'customers.manage' },
  { module: 'suppliers', legacy: 'suppliers.manage' },
  { module: 'invoices', legacy: 'invoices.manage' },
  { module: 'expenses', legacy: 'expenses.manage' },
  { module: 'reports', legacy: 'reports.view' },
  { module: 'users', legacy: 'users.manage' },
  { module: 'settings', legacy: 'settings.manage' },
  { module: 'shifts', legacy: 'hr.manage' },
];

for (const { module, legacy } of replacements) {
  // Regex to match router.METHOD(..., authorize('legacy'), ...)
  
  // router.get
  code = code.replace(new RegExp(`router\\.get\\(([^,]+),\\s*authenticate,\\s*authorize\\([^)]*?'${legacy}'[^)]*?\\)`, 'g'), 
    `router.get($1, authenticate, authorize('${module}.view')`);
    
  // router.post
  code = code.replace(new RegExp(`router\\.post\\(([^,]+),\\s*authenticate,\\s*authorize\\([^)]*?'${legacy}'[^)]*?\\)`, 'g'), 
    `router.post($1, authenticate, authorize('${module}.add')`);
    
  // router.put
  code = code.replace(new RegExp(`router\\.put\\(([^,]+),\\s*authenticate,\\s*authorize\\([^)]*?'${legacy}'[^)]*?\\)`, 'g'), 
    `router.put($1, authenticate, authorize('${module}.edit')`);
    
  // router.delete
  code = code.replace(new RegExp(`router\\.delete\\(([^,]+),\\s*authenticate,\\s*authorize\\([^)]*?'${legacy}'[^)]*?\\)`, 'g'), 
    `router.delete($1, authenticate, authorize('${module}.delete')`);
}

fs.writeFileSync(routesPath, code);
console.log('Routes updated!');
