import { query } from '../src/database/pool.js';

async function run() {
  try {
    const res = await query(`
      SELECT COUNT(*)::int AS count,
              COALESCE(SUM(
                GREATEST(0, i.total_amount - COALESCE((
                  SELECT SUM(amount)
                  FROM payments
                  WHERE reference_type = 'sale' AND reference_id = i.sale_id
                ), 0))
              ), 0) AS amount
       FROM invoices i
       JOIN sales s ON s.id = i.sale_id
       WHERE i.payment_status IN ('unpaid','partial')
         AND s.sale_type = 'wholesale'
         AND i.deleted_at IS NULL
         AND s.deleted_at IS NULL
         AND s.sale_date BETWEEN '2026-06-01'::date AND '2026-06-30'::date
    `);
    console.log("=== UNPAID INVOICES QUERY RESULT ===");
    console.table(res.rows);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
