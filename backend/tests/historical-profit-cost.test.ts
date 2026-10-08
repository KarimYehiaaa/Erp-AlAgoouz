import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { query } from '../src/database/pool.ts';
import { getReports } from '../src/services/userService.ts';

it('preserves historical category and daily profits after current prices change, including zero-cost lines', async () => {
  const suffix = randomUUID().slice(0, 12);
  const categoryName = `Historical profit ${suffix}`;
  let categoryId: number | undefined;
  let productIds: number[] = [];
  let saleId: number | undefined;
  const date = '1887-04-01';
  try {
    categoryId = (
      await query(`INSERT INTO product_categories (name_ar) VALUES ($1) RETURNING id`, [
        categoryName,
      ])
    ).rows[0].id;
    productIds = (
      await query(
        `INSERT INTO products (sku, name_ar, category_id, purchase_price, sale_price)
         VALUES ($1, 'Historical cost', $3, 10, 20), ($2, 'Historical zero cost', $3, 999, 20)
         RETURNING id`,
        [`HC-${suffix}`, `HZ-${suffix}`, categoryId],
      )
    ).rows.map((row) => Number(row.id));
    const user = (await query(`SELECT id FROM users ORDER BY id LIMIT 1`)).rows[0];
    const warehouse = (await query(`SELECT id FROM warehouses ORDER BY id LIMIT 1`)).rows[0];
    saleId = (
      await query(
        `INSERT INTO sales
           (sale_number, warehouse_id, user_id, sale_date, total_amount, cost_amount, profit_amount, status)
         VALUES ($1, $2, $3, $4, 60, 20, 40, 'completed') RETURNING id`,
        [`HP-${suffix}`, warehouse.id, user.id, date],
      )
    ).rows[0].id;
    await query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, total_amount, cost_price)
       VALUES ($1, $2, 2, 20, 40, 10), ($1, $3, 1, 20, 20, 0)`,
      [saleId, ...productIds],
    );
    const report = async () => {
      const result = await getReports('profit', { from_date: date, to_date: date });
      if (!result || Array.isArray(result) || !('daily' in result) || !('byCategory' in result)) {
        throw new Error('Profit report did not return the required daily/category shape');
      }
      return {
        category: result.byCategory.find((row) => row.category_name === categoryName),
        daily: result.daily,
      };
    };
    const before = await report();
    expect(before.category).toMatchObject({
      total_qty: 3,
      total_revenue: 60,
      total_cost: 20,
      net_profit: 40,
    });
    expect(before.daily).toHaveLength(1);
    expect(before.daily[0]).toMatchObject({ revenue: 60, cost: 20, profit: 40 });
    await query(`UPDATE products SET purchase_price = 9999 WHERE id = ANY($1::int[])`, [
      productIds,
    ]);
    expect(await report()).toEqual(before);
    await query(`UPDATE sale_items SET cost_price = NULL WHERE sale_id = $1 AND product_id = $2`, [
      saleId,
      productIds[0],
    ]);
    const incomplete = await report();
    expect(incomplete.category).toMatchObject({
      total_revenue: 60,
      total_cost: null,
      net_profit: null,
      missing_cost_items: 1,
    });
    // Stored invoice totals remain historical; category allocation cannot be invented.
    expect(incomplete.daily).toEqual(before.daily);
    await query(`UPDATE products SET purchase_price = 42 WHERE id = ANY($1::int[])`, [productIds]);
    expect(await report()).toEqual(incomplete);
  } finally {
    if (saleId) await query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    if (productIds.length)
      await query(`DELETE FROM products WHERE id = ANY($1::int[])`, [productIds]);
    if (categoryId) await query(`DELETE FROM product_categories WHERE id = $1`, [categoryId]);
  }
});
