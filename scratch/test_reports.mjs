import { getProfitAndLoss } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/services/plService.js';

import { query, getClient } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/database/pool.js';
import { roundMoney } from 'file:///d:/AlAgoouz%20System/AlAgoouz-erp/backend/src/utils/money.js';

async function testReports() {
  const client = await getClient();
  let productId = null;
  let saleId = null;

  try {
    console.log('Cleaning up old test data if exists...');
    await client.query(`DELETE FROM sales WHERE sale_number = 'TEST-SALE-001'`);
    await client.query(`DELETE FROM products WHERE sku = 'TEST-REP-1'`);
    
    console.log('Setting up test data...');
    // Create a product
    const prodRes = await client.query(`
      INSERT INTO products (sku, name_ar, min_stock, sale_price, purchase_price, category_id, is_active)
      VALUES ('TEST-REP-1', 'Test Report Product', 5, 200, 100, 1, true)
      RETURNING id
    `);
    productId = prodRes.rows[0].id;

    // Create a sale (using service so it handles inventory and PL logic if applicable)
    // Actually, createSale requires items, customer, etc. Let's just mock a sale directly to avoid complex service dependencies,
    // OR test PL directly with inserted data.
    
    await client.query(`
      INSERT INTO sales (sale_number, warehouse_id, user_id, total_amount, discount_amount, cost_amount, profit_amount, status)
      VALUES ('TEST-SALE-001', 1, 1, 400, 0, 200, 200, 'completed')
      RETURNING id
    `);
    
    const invRes = await client.query(`SELECT id FROM sales WHERE sale_number = 'TEST-SALE-001'`);
    saleId = invRes.rows[0].id;
    
    await client.query(`
      INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_amount, cost_price)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [saleId, productId, 2, 200, 400, 100]); // Revenue 400, COGS 200 (2 * 100)
    
    // Add an expense
    await client.query(`
      INSERT INTO expenses (expense_number, title, amount, expense_date)
      VALUES ('EXP-TEST-001', 'Test expense', 50, NOW())
    `);
    
  } catch (e) {
    client.release();
    console.error("Setup error:", e);
    process.exit(1);
  }
  client.release();

  try {
    // Test the P&L Report for today
    const today = new Date().toISOString().split('T')[0];
    const pl = await getProfitAndLoss(today, today);
    
    console.log('--- Profit & Loss Report Test ---');
    console.log(JSON.stringify(pl, null, 2));
    
    if (Number(pl.revenue) < 400 && Number(pl.sales_revenue) < 400 && Number(pl.sales) < 400) {
       console.error('❌ Sales not reflecting test invoice');
    } else {
       console.log('✅ Reports function is retrieving data correctly.');
    }
  } catch(e) {
    console.error(e);
  } finally {
    // Cleanup
    console.log('Cleaning up test data...');
    await query(`DELETE FROM expenses WHERE expense_number = 'EXP-TEST-001'`);
    if (saleId) {
       await query(`DELETE FROM sale_items WHERE sale_id = $1`, [saleId]);
       await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    }
    if (productId) await query(`DELETE FROM products WHERE id = $1`, [productId]);
    console.log('Done.');
    process.exit(0);
  }
}

testReports();
