import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'bin_al_ajouz',
  user: process.env.DB_USER || 'erp_user',
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    console.log("=== All Sales ===");
    const salesRes = await pool.query(
      `SELECT id, sale_number, sale_type, customer_id, total_amount, payment_status, status, sale_date, deleted_at 
       FROM sales 
       ORDER BY id DESC;`
    );
    console.log(salesRes.rows);

    console.log("\n=== All Invoices ===");
    const invoicesRes = await pool.query(
      `SELECT id, invoice_number, sale_id, customer_id, total_amount, payment_status, deleted_at, issued_at 
       FROM invoices 
       ORDER BY id DESC;`
    );
    console.log(invoicesRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
