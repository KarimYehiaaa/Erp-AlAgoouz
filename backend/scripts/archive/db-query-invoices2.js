import { query } from '../src/database/pool.js';

async function run() {
  try {
    const unpaidWholesaleInvoices = await query(`
      SELECT i.invoice_number, s.sale_number, s.sale_date, i.total_amount, i.payment_status
      FROM invoices i
      JOIN sales s ON s.id = i.sale_id
      WHERE i.payment_status IN ('unpaid','partial')
        AND s.sale_type = 'wholesale'
        AND i.deleted_at IS NULL
        AND s.deleted_at IS NULL
    `);
    console.log("=== UNPAID WHOLESALE INVOICES ===");
    console.table(unpaidWholesaleInvoices.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
