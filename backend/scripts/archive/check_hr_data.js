import pool from './src/database/pool.js';

async function main() {
  try {
    const hrTables = ['employees', 'employee_shifts', 'employee_attendance', 'employee_advances', 'payroll_runs'];
    for (const t of hrTables) {
      try {
        const res = await pool.query(`SELECT COUNT(*) FROM "${t}"`);
        console.log(`${t}: ${res.rows[0].count}`);
      } catch (err) {
        console.log(`${t}: Error - ${err.message}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
main();
