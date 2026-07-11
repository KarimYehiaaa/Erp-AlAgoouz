import { createDailySale } from '../src/services/salesService.js';

// Usage: node test-create-sale.js <productId> [quantity]
const args = process.argv.slice(2);
const productId = Number(args[0]) || 1;
const quantity = Number(args[1]) || 1;

const main = async () => {
    try {
        console.log('Creating test sale for product', productId, 'qty', quantity);
        const payload = {
            sale_type: 'branch',
            items: [
                { product_id: productId, quantity, unit_price: 1, discount_amount: 0 },
            ],
            payment_status: 'paid',
        };

        const res = await createDailySale(payload, 1);
        console.log('Sale created:', JSON.stringify(res, null, 2));
        process.exit(0);
    } catch (err) {
        console.error('Error creating sale:', err.message || err);
        if (err.stack) console.error(err.stack);
        process.exit(1);
    }
};

main();
