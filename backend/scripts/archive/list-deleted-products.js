import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// load backend/.env explicitly
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

(async () => {
    const client = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    try {
        await client.connect();
        const res = await client.query(`SELECT id, sku, name_ar, updated_at, deleted_at FROM products WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200`);
        console.log('DELETED_PRODUCTS', res.rows);
    } catch (e) {
        console.error(e.message || e);
        process.exitCode = 2;
    } finally {
        try { await client.end(); } catch (_) { }
    }
})();
