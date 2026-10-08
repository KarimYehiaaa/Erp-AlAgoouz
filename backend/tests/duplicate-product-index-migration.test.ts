import { expect, it } from 'vitest';
import { getClient } from '../src/database/pool.ts';

it('keeps one product_id index per invoice-item and sale-item table', async () => {
  const client = await getClient();
  try {
    const indexes = await client.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_purchase_invoice_items_product',
          'idx_purchase_invoice_items_product_id',
          'idx_sale_items_product',
          'idx_sale_items_product_id'
        )
      ORDER BY indexname
    `);

    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'idx_purchase_invoice_items_product',
      'idx_sale_items_product',
    ]);
    expect(indexes.rows.every((row) => row.indexdef.endsWith('(product_id)'))).toBe(true);
  } finally {
    client.release();
  }
});
