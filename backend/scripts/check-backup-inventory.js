import fs from 'fs';
import path from 'path';

function check(file) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) { console.error('missing', p); return; }
    const raw = fs.readFileSync(p, 'utf8');
    let json;
    try { json = JSON.parse(raw); } catch (e) { console.error('parse error', file, e.message); return; }
    const inv = json?.data?.inventory || [];
    const nonzero = inv.filter(i => Number(i.quantity) !== 0);
    console.log(file, 'inventory_rows=', inv.length, 'nonzero=', nonzero.length);
    if (nonzero.length > 0) console.log('samples', nonzero.slice(0, 10));
}

check('backend/backups/auto-backups/auto-backup-2026-06-02_02-07-34.json');
check('backend/backups/backup-2026-05-31T05-24-08-447Z.json');
