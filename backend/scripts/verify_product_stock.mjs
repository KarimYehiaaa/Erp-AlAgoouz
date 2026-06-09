import { query } from '../src/database/pool.js';
import { getProducts } from '../src/services/productService.js';

(async () => {
    try {
        const recipeProductsRes = await query(`SELECT DISTINCT p.id FROM products p JOIN product_recipes r ON r.product_id = p.id WHERE r.deleted_at IS NULL AND r.is_active = TRUE`);
        const productIds = recipeProductsRes.rows.map(r => r.id);
        if (!productIds.length) return console.log('No recipe products');

        const products = await getProducts({ limit: 1000 });
        const prodMap = new Map(products.map(p => [p.id, p]));

        const mismatches = [];
        for (const pid of productIds) {
            const totalRes = await query('SELECT COALESCE(SUM(quantity),0) AS sum FROM inventory WHERE product_id = $1', [pid]);
            const sum = Number(totalRes.rows[0].sum || 0);
            const prod = prodMap.get(pid) || (await query('SELECT id, name_ar FROM products WHERE id = $1', [pid])).rows[0];
            const reported = Number(prod?.total_stock || 0);
            if (sum !== reported) mismatches.push({ product_id: pid, name: prod?.name_ar, sum, reported });
        }

        if (!mismatches.length) console.log('All recipe product totals match inventory sums.');
        else console.log('Mismatches:', mismatches);
    } catch (e) { console.error('ERROR', e); process.exitCode = 1; }
})();
