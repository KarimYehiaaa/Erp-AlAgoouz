import { expect, it } from 'vitest';
import { saleSchema } from '../src/routes/schemas.ts';

it('accepts retail sales and rejects the removed branch sale channel', () => {
  expect(saleSchema.safeParse({ sale_type: 'retail' }).success).toBe(true);
  expect(saleSchema.safeParse({ sale_type: 'branch' }).success).toBe(false);
  expect(saleSchema.safeParse({ sale_type: 'wholesale' }).success).toBe(true);
  expect(saleSchema.safeParse({ sale_type: 'pos' }).success).toBe(true);
});
