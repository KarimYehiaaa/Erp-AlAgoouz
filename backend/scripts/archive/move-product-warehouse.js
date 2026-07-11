import { setProductWarehouse } from '../src/services/productService.js';

const args = process.argv.slice(2);
const productId = Number(args[0]);
const warehouseId = Number(args[1]);
if (!productId || !warehouseId) {
    console.error('Usage: node move-product-warehouse.js <productId> <warehouseId>');
    process.exit(1);
}

const main = async () => {
    try {
        console.log(`Moving product ${productId} quantities to warehouse ${warehouseId}...`);
        const res = await setProductWarehouse(productId, warehouseId);
        console.log('Result:', res);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message || err);
        process.exit(1);
    }
};

main();
