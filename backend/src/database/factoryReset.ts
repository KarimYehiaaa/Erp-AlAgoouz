import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

import pool from './pool.ts';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const executeFactoryReset = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('⏳ جاري مسح جميع حركات النظام...');

    // 1. Truncate all transactional tables
    const tablesToWipe = [
      'sales',
      'sale_items',
      'invoices',
      'payments',
      'expenses',
      'inventory',
      'stock_movements',
      'supplier_invoices',
      'activity_logs',
      'audit_logs',
      'notifications',
    ];

    // Attempt to drop additional tables if they exist (added in later migrations)
    const optionalTables = [
      'invoice_items',
      'purchase_invoices',
      'purchase_invoice_items',
      'purchase_items',
      'inventory_cost_layers',
      'inventory_cost_layer_consumptions',
      'stocktakes',
      'stocktake_items',
      'employee_attendance',
      'employee_advances',
      'payroll_runs',
      'payroll_items',
      'pos_shifts',
      'pos_cash_movements',
      'partner_drawings',
      'manager_approval_requests',
      'workflow_execution_logs',
    ];

    for (const table of optionalTables) {
      const checkRes = await client.query(`SELECT to_regclass($1) AS exists`, [table]);
      if (checkRes.rows[0].exists) {
        tablesToWipe.push(table);
      }
    }

    const truncateQuery = `TRUNCATE TABLE ${tablesToWipe.join(', ')} RESTART IDENTITY CASCADE;`;
    await client.query(truncateQuery);
    console.log(' تم مسح جداول الحركات والمخزون.');

    // 2. Reset Customers, Suppliers, and Partners Balances
    await client.query(
      `UPDATE customers SET balance = 0, current_balance = 0, loyalty_points = 0;`,
    );
    await client.query(`UPDATE suppliers SET balance = 0;`);
    const partnersExists = (await client.query(`SELECT to_regclass('partners') AS exists`)).rows[0]
      .exists;
    if (partnersExists) {
      await client.query(`UPDATE partners SET opening_balance = 0;`);
    }
    console.log(' تم تصفير أرصدة العملاء والموردين والشركاء.');

    // 3. Reset Sequences
    await client.query(`ALTER SEQUENCE IF EXISTS seq_sales_number RESTART WITH 10000;`);
    await client.query(`ALTER SEQUENCE IF EXISTS seq_invoices_number RESTART WITH 10000;`);
    await client.query(`ALTER SEQUENCE IF EXISTS seq_purchase_invoices_number RESTART WITH 1000;`);
    await client.query(`ALTER SEQUENCE IF EXISTS seq_expenses_number RESTART WITH 1000;`);
    await client.query(`ALTER SEQUENCE IF EXISTS seq_payments_number RESTART WITH 1000;`);
    console.log(' تم إعادة ضبط العدادات المتسلسلة (Sequences).');

    // 4. تهيئة صفوف المخزون لجميع المنتجات بـ 0 حتى تظهر في شاشة المخزون
    // (حتى المنتجات القديمة التي ليس لها primary_warehouse_id)
    await client.query(`
      INSERT INTO inventory (product_id, warehouse_id, quantity)
      SELECT p.id, w.id, 0
      FROM products p
      CROSS JOIN warehouses w
      WHERE p.deleted_at IS NULL AND p.is_active = TRUE
        AND w.deleted_at IS NULL AND w.is_active = TRUE
      ON CONFLICT (product_id, warehouse_id, COALESCE(batch_number, '')) DO NOTHING;
    `);
    console.log(' تم تهيئة أرصدة جميع المنتجات لتظهر كـ 0 في المخزون.');

    await client.query('COMMIT');
    console.log(' تمت عملية التنظيف (Factory Reset) بنجاح!');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error(' حدث خطأ أثناء التنظيف:', err);
  } finally {
    client.release();
    await pool.end();
    rl.close();
    process.exit(0);
  }
};

const args = process.argv.slice(2);
if (args.includes('--force')) {
  executeFactoryReset();
} else {
  console.log(
    ' تحذير: هذا السكربت سيمسح جميع فواتير المبيعات، المشتريات، المخزون، والعمليات المالية.',
  );
  console.log('البيانات الأساسية (المنتجات، العملاء، المستخدمين) ستبقى كما هي.');
  rl.question('هل أنت متأكد من رغبتك في التنظيف؟ اكتب "YES" للتأكيد: ', (answer) => {
    if (answer === 'YES') {
      executeFactoryReset();
    } else {
      console.log(' تم إلغاء العملية.');
      pool.end();
      process.exit(0);
    }
    rl.close();
  });
}
