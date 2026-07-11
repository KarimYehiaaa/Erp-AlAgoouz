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

async function main() {
  try {
    const res = await pool.query(
      `SELECT id, sale_number, sale_type, customer_id, total_amount, payment_status, status, sale_date 
       FROM sales 
       WHERE deleted_at IS NULL AND payment_status IN ('unpaid','partial');`
    );
    console.log('Unpaid/Partial Sales in DB:');
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
