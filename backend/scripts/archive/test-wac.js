import { createPurchaseInvoice } from '../src/services/purchaseService.js';
import { getClient } from '../src/database/pool.js';

async function testWAC() {
  try {
    if (process.env.RUN_MUTATING_WAC_TEST !== '1') {
      console.log('Skipped: set RUN_MUTATING_WAC_TEST=1 to create a real sugar purchase invoice.');
      process.exit(0);
    }

    console.log('Testing WAC for product purchase...');
    
    // First, let's check product 54 (Sugar)
    const client = await getClient();
    const beforeProd = await client.query('SELECT purchase_price FROM products WHERE id = 54');
    const beforeInv = await client.query('SELECT SUM(quantity) as qty FROM inventory WHERE product_id = 54');
    
    const currPrice = Number(beforeProd.rows[0].purchase_price);
    const currQty = Number(beforeInv.rows[0].qty);
    
    console.log(`Before Purchase - Product 54: Qty: ${currQty}, Price: ${currPrice}`);
    
    // Create purchase invoice: buy 10 kg of sugar at price 50 (if currPrice is 40)
    const newPrice = currPrice + 10;
    const newQty = 10;
    
    await createPurchaseInvoice({
      supplier_id: 1, // assuming supplier 1 exists
      invoice_date: new Date().toISOString().split('T')[0],
      reference_number: 'TEST-WAC-1',
      total_amount: newQty * newPrice,
      notes: 'Test WAC',
      items: [
        { product_id: 54, quantity: newQty, unit_price: newPrice, unit: 'kg' }
      ]
    }, 1);

    const afterProd = await client.query('SELECT purchase_price FROM products WHERE id = 54');
    const afterInv = await client.query('SELECT SUM(quantity) as qty FROM inventory WHERE product_id = 54');
    
    const finalPrice = Number(afterProd.rows[0].purchase_price);
    const finalQty = Number(afterInv.rows[0].qty);
    
    console.log(`After Purchase - Product 54: Qty: ${finalQty}, Price: ${finalPrice}`);
    
    // Expected WAC: ((currQty * currPrice) + (newQty * newPrice)) / (currQty + newQty)
    const expectedWac = ((currQty * currPrice) + (newQty * newPrice)) / (currQty + newQty);
    console.log(`Expected WAC: ${expectedWac}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

testWAC();
