import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/database/pool.js';
import {
  calculateOutstandingAmount,
  calculatePaidAmount,
  calculateSaleTotals,
} from '../src/services/salesService.js';
import { CLEAR_DATA_TABLES } from '../src/services/backupService.js';
import {
  calculateRecipeCost,
  getProductsEffectiveCosts,
  unitPriceFor,
} from '../src/services/productCostService.js';

test.after(async () => {
  await pool.end();
});

test('calculates item sale totals with item and sale adjustments', () => {
  const totals = calculateSaleTotals(
    [
      { product_id: 1, quantity: 2, unit_price: 50, discount_amount: 10 },
      { product_id: 2, quantity: 1.5, unit_price: 20, tax_amount: 3 },
    ],
    { discount_amount: 5, tax_amount: 2 }
  );

  assert.equal(totals.subtotal, 130);
  assert.equal(totals.itemDiscountTotal, 10);
  assert.equal(totals.totalAmount, 115); // 130 - 10 (item discount) - 5 (invoice discount) = 115
  assert.deepEqual(
    totals.items.map((item) => item.total_amount),
    [90, 30] // Item 2 tax is forced to 0: 30 instead of 33
  );
});

test('does not create a paid amount for unpaid sales', () => {
  assert.equal(calculatePaidAmount('unpaid', 250), 0);
});

test('validates partial payments and calculates outstanding balance', () => {
  assert.equal(calculatePaidAmount('partial', 250, 100), 100);
  assert.equal(calculateOutstandingAmount(250, 100), 150);
  assert.throws(() => calculatePaidAmount('partial', 250, 250), /less than invoice total/);
});

test('system clear keeps recipe definitions intact', () => {
  assert.equal(CLEAR_DATA_TABLES.includes('product_recipes'), false);
  assert.equal(CLEAR_DATA_TABLES.includes('product_recipe_items'), false);
});

test('calculates recipe component cost with unit conversion', () => {
  assert.equal(unitPriceFor(120, 'kg', 'g'), 0.12);
  assert.equal(calculateRecipeCost([
    { quantity: 250, unit_code: 'g', ingredient_unit: 'kg', ingredient_purchase_price: 120 },
    { quantity: 2, unit_code: 'count', ingredient_unit: 'count', ingredient_purchase_price: 3.5 },
  ]), 37);
});

test('effective product cost resolves recipe ingredients recursively', async () => {
  const db = {
    query: async (sql, params = []) => {
      const text = String(sql).toLowerCase();
      const productId = Number(params[0]);

      if (text.includes('select p.id, p.purchase_price') && text.includes('from products p')) {
        const rows = {
          10: [{ id: 10, purchase_price: 99 }],
          11: [{ id: 11, purchase_price: 25 }],
        };
        return { rows: rows[productId] || [] };
      }

      if (text.includes('from product_recipes r') && text.includes('join product_recipe_items ri')) {
        const rows = {
          10: [
            {
              recipe_id: 7,
              recipe_item_id: 1,
              ingredient_product_id: 11,
              quantity: 500,
              unit_code: 'g',
              ingredient_unit: 'kg',
            },
          ],
          11: [],
        };
        return { rows: rows[productId] || [] };
      }

      return { rows: [] };
    },
  };

  const costs = await getProductsEffectiveCosts(db, [10, 11]);
  assert.deepEqual(costs.get(10), { cost: 12.5, source: 'recipe' });
  assert.deepEqual(costs.get(11), { cost: 25, source: 'purchase_price' });
});
