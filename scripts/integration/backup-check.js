// Integration check script for backup endpoints
// Usage: node scripts/integration/backup-check.js http://localhost:3000/api/v1 <API_TOKEN>
// This script performs create -> list -> download -> (optional) restore by name -> clear (requires CONFIRM_CLEAR)

import axios from 'axios';
import fs from 'fs';

const [baseUrl, token] = process.argv.slice(2);
if (!baseUrl) {
    console.error('Usage: node backup-check.js <baseApiUrl> [token]');
    process.exit(1);
}

const client = axios.create({ baseURL: baseUrl, headers: { Authorization: token ? `Bearer ${token}` : undefined } });

(async () => {
    try {
        console.log('Creating backup...');
        const createRes = await client.get('/backup/create');
        console.log('Create response:', createRes.data);

        console.log('Listing backups...');
        const listRes = await client.get('/backup/list');
        console.log('Backups:', listRes.data);
        const first = listRes.data?.[0]?.name;
        if (!first) { console.warn('No backup files found, aborting download/restore checks.'); return; }

        console.log('Downloading', first);
        const dl = await client.get(`/backup/download/${encodeURIComponent(first)}`, { responseType: 'arraybuffer' });
        fs.writeFileSync(`./${first}`, Buffer.from(dl.data));
        console.log('Saved to', `./${first}`);

        console.log('Attempting restore (dry-run caution) - skipping by default');
        // To actually restore, uncomment below (use on test DB only):
        // await client.post('/backup/restore', { name: first });

        console.log('Attempting clear (requires CONFIRM_CLEAR) - skipped by default');
        // To actually clear, uncomment below (use on test DB only):
        // await client.post('/backup/clear', { confirm: 'CONFIRM_CLEAR' });

        console.log('Integration check finished successfully.');
    } catch (e) {
        console.error('Error during integration check:', e.response?.data || e.message);
        process.exit(2);
    }
})();
