import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

(async () => {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER || 'erp_user',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'bin_al_ajouz',
    });

    try {
        await client.connect();

        const q1 = await client.query(`SELECT COUNT(*) AS total_products, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_products, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_products FROM products;`);
        console.log('PRODUCTS', q1.rows);

        const q2 = await client.query(`SELECT COUNT(*) AS inventory_rows, COALESCE(SUM(quantity),0) AS total_stock FROM inventory;`);
        console.log('INVENTORY', q2.rows);

        const q3 = await client.query(`SELECT COUNT(*) AS total_recipes, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_recipes FROM product_recipes;`);
        console.log('RECIPES', q3.rows);

        const q4 = await client.query(`SELECT COUNT(*) AS product_recipe_items FROM product_recipe_items;`);
        console.log('RECIPE_ITEMS', q4.rows);

    } catch (err) {
        console.error('DB check failed:', err.message || err);
        process.exitCode = 2;
    } finally {
        try { await client.end(); } catch (_) { }
    }
})();
