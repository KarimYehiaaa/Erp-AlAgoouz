import { query } from '../src/database/pool.js';

async function run() {
  try {
    const invoices = await query(`
      SELECT i.id, i.invoice_number, i.sale_id, i.invoice_type, i.payment_status, i.total_amount, i.deleted_at
      FROM invoices i
    `);
    console.log("=== ALL INVOICES ===");
    console.table(invoices.rows);

    const sales = await query(`
      SELECT s.id, s.sale_number, s.sale_type, s.payment_status, s.total_amount, s.deleted_at, s.status
      FROM sales s
      WHERE s.sale_type = 'wholesale'
    `);
    console.log("\n=== WHOLESALE SALES ===");
    console.table(sales.rows);

    const unpaidWholesaleInvoices = await query(`
      SELECT i.invoice_number, s.sale_number, i.total_amount, i.payment_status, i.deleted_at as invoice_deleted, s.deleted_at as sale_deleted
      FROM invoices i
      JOIN sales s ON s.id = i.sale_id
      WHERE i.payment_status IN ('unpaid','partial')
        AND s.sale_type = 'wholesale'
    `);
    console.log("\n=== UNPAID WHOLESALE INVOICES (Joined) ===");
    console.table(unpaidWholesaleInvoices.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
