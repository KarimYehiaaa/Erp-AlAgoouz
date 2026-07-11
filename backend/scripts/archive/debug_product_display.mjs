import { query } from '../src/database/pool.js';
import { getProducts, getProductById } from '../src/services/productService.js';

const check = async (pid, warehouseId = null) => {
    console.log('--- Product', pid, 'warehouse', warehouseId);
    const prod = await getProductById(pid).catch(e => { console.error('getProductById err', e.message); return null });
    console.log('getProductById.stock:', JSON.stringify(prod?.stock || [], null, 2));
    const all = await getProducts({ limit: 1000 }).catch(e => { console.error('getProducts err', e.message); return [] });
    const pAll = all.find(p => p.id === pid);
    console.log('getProducts() total_stock:', pAll?.total_stock);
    if (warehouseId != null) {
        const byWh = await getProducts({ warehouse_id: warehouseId, limit: 1000 }).catch(e => { console.error('getProducts(wh) err', e.message); return [] });
        const pBy = byWh.find(p => p.id === pid);
        console.log(`getProducts(warehouse_id=${warehouseId}).store_stock?`, pBy?.store_stock || pBy?.total_stock || null);
    }
    const inv = await query('SELECT warehouse_id, quantity FROM inventory WHERE product_id=$1 ORDER BY warehouse_id', [pid]);
    console.log('inventory rows:', inv.rows);
}

(async () => {
    try {
        await check(74, 1);
        await check(76, 1);
    } catch (e) { console.error(e); process.exitCode = 1 }
})();
